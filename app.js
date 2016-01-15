var client = require('./slackClient');
var slack = client();
var _ = require('underscore');

slack.registerRtmCallback(slack.events.message, function(data) {
	var msg = slack.parseMessage(data.text);
	
	if (msg.toMe) {
		if (msg.text === 'quit') {
			process.exit();
		} else if (msg.text === 'getBadProfiles') {
			slack.getBadProfiles()
				.done(function(profiles) {
					var msg;
	
					if (profiles.length > 0) {
						msg = 'Yay! I found some bad profiles! Uh, I mean, booooo...';
						for (var i = 0; i < profiles.length; i++) {
							msg += '\n' + (i+1) + ') ' + profiles[i].name;
						}
					} else {
						msg = 'I couldn\'t find any bad profiles';
					}
	
					slack.rtm.sendMsg(data.channel, msg);
				});
		} else if (msg.text === 'chuck norris') {
            slack.getChuckJoke()
                .done(function(joke) {
                    slack.rtm.sendMsg(data.channel, joke);
                });
        } else {
			slack.rtm.sendMsg(data.channel, 'oh @' + slack.rtm.getUser(data.user).name + ', that\'s so funny.');
		}
	}
});