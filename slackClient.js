var config = require('./appConfig.json');
var crypto = require('crypto');
var request = require('request');
var _ = require('underscore');
var deferred = require('deferred');
var SlackAPI = require('slackbotapi');
var Entities = require('html-entities').AllHtmlEntities;

module.exports = function() {
    var getUrl = function(apiMethod) {
        return config.api_root + apiMethod + '?token=' + config.token;
    };

    var makeGetRequest = function(options) {
        var def = deferred();
        var url = null;
        if (options.method) {
            url = getUrl(options.method);

            if (!_.isEmpty(options.args) && _.isObject(options.args)) {
                _.each(options.args, function (value, key) {
                     url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(value);
                });
            }
        } else if (options.url) {
            url = options.url
        }

        if (url !== null) {
            request.get(url, function(error, response, body) {
                if (!error && response.statusCode === 200) {
                    def.resolve(JSON.parse(body));
                }
            });
        } else {
            def.reject('No url or method was specified');
        }

        return def.promise();
    };

    var getChecksum = function(data) {
        return crypto
                .createHash(config.checksum_algorithm)
                .update(data)
                .digest('hex');
    };

    var bot = new SlackAPI({
        token: config.token,
        logging: true,
        autoReconnect: false
    });

    bot.on('channel_joined', function (data) {
        var channel = data.channel;
        var index = _.findIndex(bot.slackData.channels, function (c) { return c.id === channel.id; });
        if (index > -1) {
            bot.slackData.channels[index] = channel;
        } else {
            bot.slackData.channels.push(channel);
        }
    });

    bot.on('channel_left', function (data) {
        _.find(bot.slackData.channels, function (c) {
            if (c.id == data.channel) {
                c.is_member = false;
                return true;
            }
        });
    });

    var permissions = {
        admin: 1,
        user: 2
    };

    var everyonePermission = permissions.admin + permissions.user;

    var getPermissionsForUser = function(user) {
        if (_.isObject(user) && user.id && !user.deleted) {
            return (user.is_admin === true) ? permissions.admin : permissions.user;
        } else {
            return 0;
        }
    };

    var commandArgs = {
        channel: '<(#C\\w+)(?:\\|.*)?>(.*)',
        optionalBuffer: ':?\\s*'
    };

    var commands = [
        { cmd: 'chuck norris', description: 'Tells a Chuck Norris Fact', args: '', access: everyonePermission },
        //{ cmd: 'getBadProfiles', description: 'Lists users who have the default avatar', args: '', access: permissions.admin },
        { cmd: 'listChannels', description: 'Lists the channels I belong to', args: '', access: permissions.admin },
        { cmd: 'help', description: 'Displays the list of commands I am listening for', args: '', access: everyonePermission },
        { cmd: 'printDebugState', description: 'Prints debug information to the console I am running on', args: '', access: permissions.admin },
        { cmd: 'quit', description: 'Causes me to log off from Slack', args: '', access: permissions.admin }
    ];

    _.each(commands, function(c) {
        c.regexp = new RegExp('(' + c.cmd + ')' + c.args);
    });

    var parseTextForCommand = function(text) {
        for (var i = 0; i < commands.length; i++) {
            var matches = commands[i].regexp.exec(text);

            if (matches && matches.length > 0) {
                return {
                    command: matches[1],
                    arguments: _.rest(matches, 2),
                    access: commands[i].access
                };
            }
        }

        return text;
    };

    var apiMethods = {
        events: bot.events,
        registerRtmCallback: function(event, callback) {
            bot.on(event, callback);
        },
        rtm: bot,
        parseMessage: function(payload) {
            var regex = new RegExp('^<(.*?)>:?\s?(.*)');
            var matches = regex.exec(payload.text);
            var isIm = (bot.getIM(payload.channel) !== null);
            var parsedMsg = {
                cmd: null,
                hasPermission: false,
                isIm: isIm,
                sentBy: bot.getUser(payload.user),
                text: null,
                toMe: false
            };

            if (isIm || (matches && matches.length > 0)) {
                var toMe = isIm || (matches[1].indexOf(bot.slackData.self.id) >= 0);
                parsedMsg.toMe = toMe;

                if (toMe) {
                    var text = (matches) ? matches[2].trim() : payload.text;
                    var obj = parseTextForCommand(text);

                    if (_.isObject(obj)) {
                        var p = getPermissionsForUser(parsedMsg.sentBy);
                        parsedMsg.cmd = obj;
                        parsedMsg.hasPermission = (obj.access & p) === p;
                    } else {
                        parsedMsg.text = text;
                    }
                } else {
                    parsedMsg.text = payload.text;
                }
            } else {
                parsedMsg.toMe = isIm;
                parsedMsg.text = payload.text;
            }

            return parsedMsg;
        },
        listCommands: function(channel, requestedByUser) {
            var msg = 'Here\'s the list of commands I\'m listening for:';
            var userPerm = getPermissionsForUser(requestedByUser);
            var count = 0;
            _.each(commands, function(c, index) {
                if ((c.access & userPerm) > 0) {
                    msg += '\n' + (++count) + ') ';
                    if (!_.isEmpty(c.help)) {
                        msg += c.help;
                    } else {
                        msg += c.cmd;
                    }

                    if (!_.isEmpty(c.description)) {
                        msg += ' - ' + c.description;
                    }
                }
            });

            msg += '\nTo use one of those commands just type my handle and the command';

            if (count > 0) {
                bot.sendMsg(channel, msg);
            }
        },
        listJoinedChannels: function(channel) {
            var msg = 'Here\'s the list of channels I\'m in:';
            var count = 0;
            _.each(bot.slackData.channels, function(c) {
                if (c.is_member) {
                    msg += '\n#' + c.name;
                    count++;
                }
            });

            if (count > 0) {
                bot.sendMsg(channel, msg);
            } else {
                bot.sendMsg(channel, 'Doesn\'t look like I belong to any channels at the moment');
            }
        },
        getUserList: function() {
            return makeGetRequest({ method: 'users.list'});
        },
        authTest: function() {
            return makeGetRequest({ method: 'auth.test'});
        },
        quit: function() {
            setTimeout(function() { process.exit(); }, 500);
        },
        getUniqueGravatars: null,
        getBadProfiles: null,
        getChuckJoke: null
    };

    apiMethods.getUniqueGravatars = function() {
        var def = deferred();
        apiMethods.getUserList()
            .done(function(users) {
            var avatars = [];
            var baseUrl = 'https://secure.gravatar.com/avatar/';
            var regex = new RegExp(baseUrl + '([0-9a-f]+\.[^?]+)');
            _.each(users.members, function(u) {
                if (u.deleted) return;
                var result = regex.exec(u.profile.image_24);
                if (result === null) return;
                avatars.push({
                    id: u.id,
                    name: u.name,
                    real_name: u.real_name,
                    image: result[1],
                    imageUrl: baseUrl + result[1]
                });
            });
            def.resolve(avatars);
        });
        return def.promise();
    };

    apiMethods.getBadProfiles = function() {
        var def = deferred();

        apiMethods.getUniqueGravatars()
        .done(function(users) {
            var badProfiles = [];
            deferred.map(
                _.map(users, function(u) {
                    var inner = deferred();
                    request.get(u.imageUrl, function(error, response, body) {
                        if (!error && response.statusCode === 200) {
                            var checksum = getChecksum(body);
                            if (_.contains(config.slack_gravatar_checksums, checksum)) {
                                inner.resolve(u);
                            } else {
                                inner.resolve(null);
                            }
                        } else {
                            inner.reject();
                        }
                    });
                    return inner.promise();
                }))(function(results) {
                    if (_.isArray(results)) {
                        for(var i = 0; i < results.length; i++) {
                            if (results[i] !== null) {
                                badProfiles.push(results[i]);
                            }
                        }
                    }
                    def.resolve(badProfiles);
                });
        });

        return def.promise();
    };

    var lastChuckNorrisTime = 0;
    apiMethods.getChuckJoke = function() {
        var def = deferred();

        if (Date.now() - lastChuckNorrisTime > config.chuck_norris_call_interval * 1000) {
            lastChuckNorrisTime = Date.now();
            makeGetRequest({ url: config.chuck_norris_url })
                .done(function (result) {
                    if (result.type === 'success') {
                        def.resolve(new Entities().decode(result.value.joke));
                    } else {
                        def.reject('Looks like I ran into a problem. Chuck Norris service returned result type: ' + result.type);
                    }
                });
        }
        else {
            def.reject('Sorry, I was asked about Chuck Norris too recently. Try again in a little bit.');
        }

        return def.promise();
    };

    return apiMethods;
};
