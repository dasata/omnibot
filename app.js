var client = require('./slackClient');
var slack = client();
var _ = require('underscore');

slack.registerRtmCallback(slack.events.message, function(data) {
	var msg = slack.parseMessage(data);
	
	if (msg.toMe) {
		if (!_.isUndefined(msg.cmd)) {
			//slack.rtm.sendTyping(data.channel);
			if (msg.cmd.command === 'getBadProfiles') {
				slack.rtm.sendMsg(data.channel, 'One moment, thinking...');
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
			} else if (msg.cmd.command === 'help') {
				slack.listCommands(data.channel);
			} else if (msg.cmd.command === 'debugState') {
				console.log(slack.rtm.slackData);
			}
		} else if (!_.isUndefined(msg.text)) {	
			if (msg.text === 'quit') {
				process.exit();
			} else {
				slack.rtm.sendMsg(data.channel, 'oh @' + slack.rtm.getUser(data.user).name + ', that\'s so funny.');
			}
		}
	}
});