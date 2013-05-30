var Stats = require("fast-stats").Stats

module.exports = function () {
  var trackers = {};
  return {
    summary : function() {
      var result = {};
      for (var k in trackers) {
        if (trackers.hasOwnProperty(k)) {
          result[k] = {
            avg : trackers[k].amean(),
            count : trackers[k].length,
            sum : trackers[k].sum,
            stddev : trackers[k].stddev()
          }
        }
      }
      return result
    },
    stat : function (name, value) {
      if (!trackers[name]) {
        trackers[name] = new Stats({store_data : false})
      }
      trackers[name].push(value);
    }
  }
}
