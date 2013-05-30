var docwatch = require(__dirname+"/lib/docwatch");

var numDocs = 500,
  chsPerDoc = 5,
  numChans = 10,
  gatewayList = ["http://localhost:4984/db"];

var httpAgent = require("http").globalAgent;
httpAgent.maxSockets = numChans * 10;

var chans = makeChans(numChans);

// make a bunch of docs with N channels
// save them and ensure they show up on the right channels
// this should work even with shared-nothing sync gateway

function makeChans(numChans) {
  var chans = []
  for (var i = numChans; i >= 0; i--) {
    chans.push("ch"+i);
  };
  return chans;
};

function makeDoc () {
  var chan, doc = {channels : [], _id : (Math.random().toString(18).substring(2))};
  while (doc.channels.length < chsPerDoc) {
    chan = chans[Math.floor(Math.random() * numChans)] // random distribution of channel membership. TODO use power law?
    if (doc.channels.indexOf(chan) == -1) {
      doc.channels.push(chan);
    }
  }
  return doc;
}

function doTest () {
  var runner = docwatch(gatewayList),
    count = 0;

  function docLoop() {
    if (count < numDocs) {
      count++
      var doc = makeDoc();
      // console.log("doc", count, doc.channels)
      runner.watchDoc(doc, doc.channels, docLoop)
    } else {
      runner.doneSaving();
    }
  }

  runner.on("complete", function(stats){
    console.log("finished", stats)
    process.exit()
  })

  docLoop();
}


doTest()
