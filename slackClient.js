var config = require('./appConfig.json');
var crypto = require('crypto');
var request = require('request');
var _ = require('underscore');
var deferred = require('deferred');
var SlackAPI = require('slackbotapi');

module.exports = function() {
	var getUrl = function(apiMethod) {
		return config.api_root + apiMethod + '?token=' + config.token;
	};
	
	var makeGetRequest = function(options) {
		var def = deferred();
        var url = null;
        if (options.method) {
            url = getUrl(options.method);
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
			
	var apiMethods = {
		events: bot.events,
		registerRtmCallback: function(event, callback) {
			bot.on(event, callback);		
		},
		rtm: bot,
		parseMessage: function(text) {
			var regex = new RegExp('^<(.*?)>:?\s?(.*)');
			var matches = regex.exec(text);
			
			if (matches && matches.length > 0) {
				var toMe = (matches[1].indexOf(bot.slackData.self.id) >= 0);
				return {
					toMe: toMe,
					text: (toMe) ? matches[2].trim() : text
				};
			} else {
				return {
					toMe: false,
					text: text
				};
			}
		},
		getUserList: function() {
			return makeGetRequest({ method: 'users.list'});
		},
		authTest: function() {
			return makeGetRequest({ method: 'auth.test'});
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
    
    apiMethods.getChuckJoke = function() {
        var def = deferred();
        
        makeGetRequest({ url: config.chuck_norris_url })
            .done(function(result) {
                if (result.type === 'success') {
                    def.resolve(result.value.joke);
                } else {
                    def.reject('Chuck Norris service returned result type ' + result.type);
                }
            });
        
        return def.promise();
    };
	
	return apiMethods;
};