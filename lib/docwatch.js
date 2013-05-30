var ee = require("events").EventEmitter,
  util = require("util"),
  coax = require("coax"),
  trackstats = require(__dirname+"/trackstats")


function DocWatch(servers) {
  ee.call(this);
  this.servers = servers;
  this.chanDocs = {};
  this.stats = trackstats();
  this.allSaved = false;
  // var self = this;
  // setInterval(function() {
  //   self.maybeDone()
  // },500)
}

util.inherits(DocWatch, ee);

function empty(docs) {
  // for (var k in docs) {
  //   if (docs.hasOwnProperty(k)) {
  //     if (!docs[k].saw) {
  //       return false;
  //     }
  //   }
  // }
  // return true;
  return Object.keys(docs).length == 0
}

DocWatch.prototype.randomServer = function() {
  return coax(this.servers[Math.floor(Math.random() * this.servers.length)])
}

DocWatch.prototype.watchChannels = function(chans, done) {
  var self = this;
  chans.forEach(function(ch){
    self.randomServer().changes({
        filter : "sync_gateway/bychannel",
        feed : "continuous", // comment out for longpoll
        channels: ch
      }, function(err, change){
      if (err) throw (err);
      self.handleChange(ch, change);
    })
    // listener.on("data", function(d){
    //   console.log("cdata", d.toString())
    // })
    // console.log("listener", listener)
  });
  done() // todo we should get the changes connector to provide a "connected" event
}



DocWatch.prototype.watchDoc = function(doc, channels, saved) {
  // save the doc to a random server
  var server = this.randomServer(),
    start = new Date(),
    self = this;

  self.expectDocOnChannels(doc._id, null, channels);
  server.put(doc._id, doc, function(err, ok) {
    if (err) {throw(err)}
    var took = new Date() - start
    self.stats.stat("save", took)
    // console.log("saved", server.pax, took, err, ok.id, doc.channels)
    // observe for it to show up on the changes feed for all the channels
    saved()
    self.expectDocOnChannels(ok.id, ok.rev, channels);
  })
};

DocWatch.prototype.expectDocOnChannels = function (id, rev, channels) {
  var self = this;
  channels.forEach(function(ch){
    self.chanDocs[ch] = self.chanDocs[ch] || {};
    if (self.chanDocs[ch][id] && self.chanDocs[ch][id].early) {
      delete self.chanDocs[ch][id]
      if (empty(self.chanDocs[ch])) {
        self.maybeDone()
      }
    } else {
      self.chanDocs[ch][id] = {rev : rev, start : new Date()}
    }
  });
}

DocWatch.prototype.handleChange = function(chan, change) {
  var docs = this.chanDocs[chan];
  if (docs && docs[change.id] && docs[change.id].rev === change.changes[0].rev) {
    var took = new Date() - docs[change.id].start
    this.stats.stat("change", took)
    delete docs[change.id]
    // console.log("saw", chan, change.id)
    if (empty(docs)) {
      this.maybeDone()
    }
  } else if (docs && docs[change.id] && docs[change.id].rev === null) {
    console.log("early change!", chan, change.id)
    docs[change.id].early = true;
  } else {
    console.log("unexpected change!", chan, change.id)
  }
}

DocWatch.prototype.doneSaving = function () {
  this.allSaved = true;
  console.log("doneSaving")
  this.maybeDone()
}


DocWatch.prototype.allChannelsClear = function () {
  var ch;
  for (ch in this.chanDocs) {
    // console.log("allChannelsClear", l)
    if (this.chanDocs.hasOwnProperty(ch)) {
      if (!empty(this.chanDocs[ch])) {
        // var self = this;
        // [ch].forEach(function(c) {
        //   console.log("not clear", c, self.chanDocs[c])
        //   setTimeout(function(){
        //     console.log("get changes on", c)
        //     self.randomServer()(["_changes", {filter : "sync_gateway/bychannel", channels:c}], function(err, data){
        //       // console.log("changes", c, data)
        //       data.results.forEach(function(row) {
        //         if (!self.chanDocs[c][row.id].saw) {
        //           console.log("unseen but in changes, wtf", row)
        //         }
        //       });
        //     })
        //   }, 1000)
        // })
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
