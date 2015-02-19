module.exports = {
    newGuid: function () {
        var s4 =  function () {
            return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
        };
        return (s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4());
    },
    getRandom: function (min, max) {
        return Math.random() * (max - min) + min;
    }
};