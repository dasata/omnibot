var config = require('./appConfig.json');
var client = require('./slackClient');
var _ = require('underscore');
var crypto = require('crypto');
var request = require('request');
var deferred = require('deferred');

var promptForInput = function(prompt, callback) {
	var stdin = process.stdin,
		stdout = process.stdout;
	
	stdin.resume();
	stdin.setEncoding('utf8');
	stdout.write(prompt);
	
	stdin.once('data', function(data) {
		data = data.toString().trim();
		callback(data);
	});
};

var processInput = function(input) {
	if (input !== 'q') {
		slack[keys[input]](function(returnValue) {
			console.log(returnValue);
			promptForInput(question, processInput);
		});
	} else {
		process.exit();
	}
};

var checksum = function(data) {
	return crypto
			.createHash(config.checksum_algorithm)
			.update(data)
			.digest('hex');	
};

var slack = client(config.protocol, config.hostname, config.api_root, config.token);
var question = '\nWhich method would you like to call?\n';
var keys = _.keys(slack).sort();

_.each(keys, function(key, index) {
	question += '\t' + index + ') ' + key + '\n';
});

question += '\tq) quit\nEnter your selection: ';

//promptForInput(question, processInput);
slack.getBadProfiles(checksum, config.slack_gravatar_checksums)
	.done(function(profiles) {
		console.log('<ul>');
		_.each(profiles, function(p) { 
			console.log('<li>' + p.real_name + '<img src="' + p.imageUrl + '" /></li>'); 
		});
		console.log('</ul>');
	});