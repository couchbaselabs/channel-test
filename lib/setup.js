module.exports = function(numChans) {
	var channels = makeChans(numChans);
};

var chans = [];

function makeChans(numChans) {

	for (var i = numChans; i >= 0; i--) {
		chans.push("ch"+i);
	};
}
