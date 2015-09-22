var client = require('./slackClient');
var slack = client();

slack.registerRtmCallback(slack.events.message, function(data) {
	if (data.text == 'undefined') return;
	if (data.text == 'quit') process.exit();
	slack.rtm.sendMsg(data.channel, 'oh @' + slack.rtm.getUser(data.user).name + ', that\'s so funny.');
});