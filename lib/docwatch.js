var ee = require("events").EventEmitter,
  util = require("util"),
  coax = require("coax"),
  trackstats = require(__dirname+"/trackstats")


function DocWatch(servers) {
  ee.call(this);
  this.servers = servers;
  this.channelListeners = {};
  this.stats = trackstats();
  this.allSaved = false;
  var self = this;
  setInterval(function() {
    self.maybeDone()
  },500)
}

util.inherits(DocWatch, ee);

DocWatch.prototype.randomServer = function() {
  return coax(this.servers[Math.floor(Math.random() * this.servers.length)])
}

DocWatch.prototype.watchDoc = function(doc, channels, saved) {
  // save the doc to a random server
  var server = this.randomServer(),
    start = new Date(),
    self = this;

  server.put(doc._id, doc, function(err, ok) {
    if (err) {throw(err)}
    var took = new Date() - start
    self.stats.stat("save", took)
    console.log("saved", server.pax, took, err, ok.id, doc.channels)
    // observe for it to show up on the changes feed for all the channels
    saved()
    self.expectDocOnChannels(ok.id, ok.rev, doc.channels);
  })
};

DocWatch.prototype.expectDocOnChannels = function (id, rev, channels) {
  var self = this
  channels.forEach(function(ch){
    if (!self.channelListeners[ch]) {
      self.channelListeners[ch] = new ChannelListener(ch, self);
    }
    self.channelListeners[ch].expectDoc(id, rev) // if this gets called after the ChannelListener changes callback sees the doc, we have a race
                                                  // eg it could race if the changes feed shows a doc before the write PUT returns
                                                  // should that ever be a concern, we can modify the code to use a provisional expectation (without rev)
  })
}

DocWatch.prototype.doneSaving = function () {
  this.allSaved = true;
  console.log("doneSaving")
  this.maybeDone()
}


DocWatch.prototype.allChannelsClear = function () {
  var l;

  for (l in this.channelListeners) {
    // console.log("allChannelsClear", l)
    if (this.channelListeners.hasOwnProperty(l)) {
      if (!this.channelListeners[l].allSeen()) {
        console.log("clear?", l, this.channelListeners[l].docs)
        return false;
      }
    }
  }
  return true;
}


DocWatch.prototype.maybeDone = function () {
  if (this.allSaved && this.allChannelsClear()) {
    this.emit("complete", this.stats.summary())
  }
}

module.exports = function(servers) {
  return new DocWatch(servers);
};


function ChannelListener (ch, runner) {
  this.ch = ch;
  this.runner = runner;
  var docs = this.docs = {};
  var self = this;

  this.allSeen = function () {
    return Object.keys(docs).length == 0
  }

  setTimeout(function(){
    var statsAfter = new Date()
    runner.randomServer().changes({filter : "sync_gateway/bychannel", channels:ch}, function(err, change){
      // console.log("change", change)
      if (docs[change.id] && docs[change.id].rev === change.changes[0].rev) {
        if (docs[change.id].start > statsAfter) {
          var took = new Date() - docs[change.id].start
          runner.stats.stat("change", took)
        }

        delete docs[change.id]
        if (self.allSeen()) {
          runner.maybeDone()
        }
      } else {
        console.log("unexpected change!", ch, change.id)
      }
    })
  }, 500)


}

ChannelListener.prototype.expectDoc = function (id, rev) {
  this.docs[id] = {rev : rev, start : new Date()};
  // console.log("docs", this.ch, this.docs)
}

