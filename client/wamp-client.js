// Wamp-one wamp-client.js 1.0.1
// (c) 2015 Samorukov Valentin, Kuvshinov Evgeniy
// Wamp-one may be freely distributed under the MIT license.
(function () {

    // Thanks to Underscore.js for export code
    // Establish the root object, `window` in the browser, or `exports` on the server.
    var root = this;

    var msgTypes = {
        "WELCOME": 0,
        "PREFIX": 1,
        "CALL": 2,
        "CALLRESULT": 3,
        "CALLERROR": 4,
        "SUBSCRIBE": 5,
        "UNSUBSCRIBE": 6,
        "PUBLISH": 7,
        "EVENT": 8,
        "SUBSCRIBED": 9,
        "SUBSCRIBEERROR": 10,
        "HEARTBEAT": 20
    };
    var wsStates = {
        "CONNECTING": 0,
        "OPEN": 1,
        "CLOSING": 2,
        "CLOSED": 3
    };
    var helpers = {
        newGuid: function () {
            var s4 = function () {
                return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
            };
            return (s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4());
        },
        getRandom: function (min, max) {
            return Math.random() * (max - min) + min;
        }
    };

    var WampClient = function (heartBeat) {
        if (!(this instanceof WampClient)) {
            return new WampClient(heartBeat);
        }
        var self = this;
        self._wsClient = null;
        self._heartBeat = heartBeat;
        self._subscribeHandlers = {};
        self._callHandlers = {};
        self._heartBeatHandlers = {};
        self._heartBeatInterval = 5 * 1000;
        self._openHandler = self._openHandler.bind(self);
        self._closeHandler = self._closeHandler.bind(self);
        self._errorHandler = self._errorHandler.bind(self);
        self._messageHandler = self._messageHandler.bind(self);
        self.close = self._close.bind(self);
        self.onclose = null;
        self.open = self.connect = self._connect.bind(self);
        self.onopen = null;
        self.call = self._call.bind(self);
        self.subscribe = self._subscribe.bind(self);
        self.unsubscribe = self._unsubscribe.bind(self);

    };

    // Thanks to Underscore.js for export code
    // Export the WampClient function for **Node.js**, with
    // backwards-compatibility for the old `require()` API. If we're in
    // the browser, add `WampClient` as a global object.
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = WampClient;
        }
        exports.WampClient = WampClient;
    } else {
        root.WampClient = WampClient;
    }

    /**
     *
     * @param serverUrl - адрес сервера
     * @param cb - callback, который отработает при успешном соединении с сервером
     * @private
     */
    WampClient.prototype._connect = function (serverUrl, cb) {
        var self = this;
        if (self._wsClient) {
            if (self._wsClient.readyState !== wsStates.CLOSED) {
                throw new Error('WebSocket not closed. Close WebSocket and try again. To close WebSocket use function "close()"');
            }
        }
        if (!/^(wss?:\/\/).+/.test(serverUrl)) {
            console.error('Incorrect server url: ' + serverUrl);
            return;
        }
        self._serverUrl = serverUrl;
        self._wsClient = new WebSocket(serverUrl);
        self._wsClient.onopen = self._openHandler;
        self._wsClient.onclose = self._closeHandler;
        self._wsClient.onmessage = self._messageHandler;
        self._wsClient.onerror = self._errorHandler;
        self._connectHandler = cb;
    };

    /**
     *
     * @param needReconnect - необходимость переподключения после закрытия соединения (используется внутри WampClient).
     * Если null - то считаем, что соединение закрыли снаружи
     * @private
     */
    WampClient.prototype._close = function (code, reason) {
        var self = this;
        if (self._wsClient) {
            self._wsClient.close(code, reason);
        }
    };

    /**
     * Отправка запроса на сервер
     * @param url
     * @param callback - callback, который вызовется, когда придет ответ с сервера
     * @private
     */
    WampClient.prototype._call = function (url, callback) {
        var self = this,
            callId = helpers.newGuid();
        if (self._wsClient.readyState === wsStates.OPEN) {
            self._callHandlers[callId] = callback;
            var callData = [msgTypes.CALL, callId, url];
            callData = callData.concat(Array.prototype.slice.call(arguments, 2));
            self._wsClient.send(JSON.stringify(callData));
        } else {
            throw new Error('WebSocket not connected');
        }
    };

    /**
     * Подписка на серверные события
     * @param url
     * @param callback
     * @private
     */
    WampClient.prototype._subscribe = function (url, callback) {
        var self = this;
        if (self._wsClient.readyState === wsStates.OPEN) {
            self._subscribeHandlers[url] = callback;
            self._wsClient.send(JSON.stringify([msgTypes.SUBSCRIBE, url]));
        } else {
            throw new Error('WebSocket not connected');
        }
    };

    /**
     * Отписка от серверных событий
     * @param url
     * @private
     */
    WampClient.prototype._unsubscribe = function (url) {
        var self = this;
        if (self._wsClient.readyState === wsStates.OPEN) {
            delete self._subscribeHandlers[url];
            self._wsClient.send(JSON.stringify([msgTypes.UNSUBSCRIBE, url]));
        }
    };

    WampClient.prototype._messageHandler = function (msg) {
        var self = this,
            data = JSON.parse(msg.data),
            msgType = data[0],
            id = data[1],
            msgData = data.length > 2 ? data[2] : null;
        switch (msgType) {
            case msgTypes.EVENT:
                if (typeof self._subscribeHandlers[id] === 'function') {
                    self._subscribeHandlers[id](msgData);
                }
                break;
            case msgTypes.CALLRESULT:
                if (typeof self._callHandlers[id] === 'function') {
                    self._callHandlers[id](msgData);
                }
                if (typeof self._callHandlers[id] !== 'undefined') {
                    delete self._callHandlers[id];
                }
                break;
            case msgTypes.CALLERROR:
                var err = {
                    url: msgData,
                    desc: data[3],
                    details: data.length > 4 ? data[4] : null
                };
                if (typeof self._callHandlers[id] === 'function') {
                    self._callHandlers[id](null, err);
                }
                if (typeof self._callHandlers[id] !== 'undefined') {
                    delete self._callHandlers[id];
                }
                break;
            case msgTypes.HEARTBEAT:
                if (typeof self._heartBeatHandlers[id] === 'function') {
                    self._heartBeatHandlers[id](msgData);
                }
                if (typeof self._heartBeatHandlers[id] !== 'undefined') {
                    delete self._heartBeatHandlers[id];
                }
                break;
        }
    };

    WampClient.prototype._openHandler = function () {
        var self = this;
        if (self._heartBeat) {
            self._startHeartbeat.call(self);
        }
        if (typeof self._connectHandler === 'function') {
            self._connectHandler();
        }
        if (typeof self.onopen === 'function') {
            self.onopen();
        }
    };

    WampClient.prototype._closeHandler = function (closeEvent) {
        var self = this;
        self._subscribeHandlers = {};
        self._callHandlers = {};
        self._heartBeatHandlers = {};
        clearInterval(self._hbInterval);
        if (closeEvent.code === 1006) {
            self._subscribeHandlers = {};
            setTimeout(self._startReconnect.bind(self), helpers.getRandom(2, 4) * 1000);
        }
        if (typeof self.onclose === 'function') {
            self.onclose();
        }
    };

    WampClient.prototype._startReconnect = function () {
        var self = this;
        if (self._wsClient && self._wsClient.readyState === wsStates.CLOSED) {
            self.connect.call(self, self._serverUrl);
        }
    };

    WampClient.prototype._errorHandler = function (err) {
        console.log(err);
    };

    WampClient.prototype._startHeartbeat = function () {
        var self = this;
        var hbCount = 0,
            hbCounter = 0;
        self._hbInterval = setInterval(function () {
            if (!self._wsClient || self._wsClient.readyState !== wsStates.OPEN) {
                clearInterval(self._hbInterval);
                return;
            }
            self._sendHeartbeat.call(self, hbCount++, function () {
                hbCounter = 0;
            });
            hbCounter++;
            if (hbCounter > 5) {
                self._close();
            }
        }, self._heartBeatInterval);
    };

    WampClient.prototype._sendHeartbeat = function (hbNumber, cb) {
        var self = this;
        self._heartBeatHandlers[hbNumber] = cb;
        self._wsClient.send(JSON.stringify([msgTypes.HEARTBEAT, hbNumber]));
    };

    Object.defineProperty(WampClient.prototype, 'state', {
        get: function () {
            return this._wsClient.readyState;
        },
        enumerable: true
    });

}.call(this));