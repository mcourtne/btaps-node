var RSVP = require('rsvp');

/**
 * Represents a PS-BTaps device
 * @constructor BTaps
 * @param {String} btaddr - Bluetooth address of the device
 */
var BTaps = function(btaddr){
    /**
     * Serial socket for bluetooth communication
     * @private
     * @type {BluetoothSerialPort}
     */
    this.socket = new (require('bluetooth-serial-port')).BluetoothSerialPort();
    
    /**
     * Bluetooth address of device provided at construction
     * @type {String}
     */
    this.btaddr = btaddr;
    
    /**
     * Timers on device, empty when disconnected
     * @type {BTapsTimer[]}
     */
    this.timers = {};  

    /**
     * Current state of the switch, always false when disconnected
     * @type {Boolean}
     */
    this.enabled = false;
};

BTaps.prototype = {

    /**
     * Promise wrapper for serial socket's write() method
     * @private
     * @param {Buffer} payload - data to send to the device
     * @param {Number} [timeout=1000] - amount of time (ms) before returned Promise is rejected
     * @returns {Promise} resolved to device's response; rejected on timeout or write failure 
     */
    __write: function(payload, timeout=1000){
      var that = this;
      var write = RSVP.denodeify(this.socket.write.bind(this.socket));
      var promise = new RSVP.Promise(function(resolve,reject){
        
        that.socket.once('data',function(data){
          resolve(data);
        });
        write(payload).then(function(){
          setTimeout(function() {
            reject(new Error('Timed out'));
            }, timeout);
        },reject);
      });

      return promise;
    },

    /**
     * Connect to device
     * @returns {Promise} resolves on successful connection; rejected when device not found, serial channel not found on device, write timeout, write failure 
     */
     connect: function(){
        
        // bind promise to BTaps object
        var that = this;

        // promise for connection request
        var promise = new RSVP.Promise(function(resolve, reject){
            that.socket.findSerialPortChannel(that.btaddr, function(channel){
                // channel found, connect to it
                that.socket.connect(that.btaddr,channel,function(){

                    // listen for disconnect to remove timers                    
                    that.socket.once('closed',function(){
                      that.timers = {};
                      that.enabled = false;
                    });  
 
                    // resolve promise after updating state from device
                    that.__updateState().then(resolve,reject);
 
                // connection rejected
                }, function(err){
                    reject(err);
                });

            // channel not found
            }, function(){
                reject(
                    new Error('No serial channels found for address '+that.btaddr)
                );
            });
        });

        return promise;
    },

    /**
     * Disconnect from device
     */
    disconnect: function(){
      this.socket.close();
    },

    /**
     * Set the state of the switch (On/Off)
     * @param {Boolean} enabled - if true, turn switch On; otherwise, turn it Off
     * @returns {Promise} resolves to device response Buffer; rejected if socket write fails or response timeout
     */
    setSwitch: function(enabled){
        
            var payload;

            if(enabled){
                // turn On
                payload = new Buffer([0xcc,0xaa,0x03,0x01,0x01,0x01]);
            }else{
                // turn Off
                payload = new Buffer([0xcc,0xaa,0x03,0x01,0x01,0x00]);
            }

            return this.__write(payload);
    },

    /**
     * Synchronize the device to the current time
     * @returns {Promise} resolves to device response Buffer; rejected on write fail or response timeout
     */
    setDateTimeNow: function(){
      var now = new Date();
      var year = dec2badHex(now.getFullYear());
      var month = dec2badHex(now.getMonth());
      var day = dec2badHex(now.getDate());
      var hour = dec2badHex(now.getHours());
      var minute = dec2badHex(now.getMinutes());
      var second = dec2badHex(now.getSeconds());
      var weekday = dec2badHex(now.getDay());
      var packet = new Buffer([0xcc, 0xaa, 0x09, 0x09, 0x01,
                              year,month,day,hour,minute,
                              second,weekday]);
      
      return this.__write(packet);      
    },

    /**
     * Helper for creating and modifying timers on device
     * @private
     * @param {BTapsTimer} timer - timer to set on device
     * @param {Boolean} create - flag to denote whether the timer should be created or modified
     * @returns {Promise} resolves to device response; rejected on write fail or response timeout 
     */
    __setTimer: function(timer,create){
      var that = this;
      var promise = new RSVP.Promise(function(resolve,reject){
    
        if(!(timer instanceof BTapsTimer)){          
          reject(new Error('Timer argument in '+create?'createTimer()':'modifyTimer()'+'must be a BTapsTimer object.'));
        }
       
        var startTime = [dec2badHex(timer.startTime[0]),dec2badHex(timer.startTime[1])];
        var endTime = [dec2badHex(timer.endTime[0]),dec2badHex(timer.endTime[1])];
        var createByte;
        
        if(create){
          createByte = 0x20;
        }else{
          createByte = 0x03;
        }
        
        var packet = new Buffer(29).fill(0);
        var tmp = new Buffer([0xcc,0xaa,0x1a,createByte,0x01,timer.id,
                   timer.repeatDayByte, startTime[0], startTime[1],
                   endTime[0], endTime[1], timer.enabled]);
        tmp.copy(packet);       
        packet.write(timer.name,7);

        that.__write(packet).then(function(resp){ 
          that.timers[timer.id] = timer;
          resolve(resp);
        },function(reason){
          reject(reason);
        });

      });

      return promise;
    },

    /**
     * Create a timer on device
     * @param {BTapsTimer} timer - timer to set on device
     * @returns {Promise} resolves to device response; rejected on write fail or response timeout 
     */
    createTimer: function(timer){
        // forward promise
        return this.__setTimer(timer,true);
    },
    
    /**
     * Modify an existing device timer
     * @param {BTapsTimer} timer - timer to set on device
     * @returns {Promise} resolves to device response; rejected on write fail or response timeout 
     */
    modifyTimer: function(timer){
        // forward promise
        return this.__setTimer(timer,false);
    },

    /**
     * Delete a timer from device
     * @param {BTapsTimer|Number} timer - timer object or identifier to remove
     * @returns {Promise} resolves to device response; rejected on write fail or response timeout
     */
    deleteTimer: function(timer){
      var that = this;
      var promise = new RSVP.Promise(function(resolve,reject){
        
        var timer_id;
        
        if( timer instanceof BTapsTimer ){
            timer_id = timer.id;
        }else{
            timer_id = timer;
        }
        
        var payload = new Buffer([0xcc,0xaa,0x04,0x19,0x01,0x01,timer_id]);
        that.__write(payload).then(function(resp){
          delete that.timers[timer_id];
          resolve(resp);
        },function(reason){
          reject(reason);
        });
      });
      return promise;
    },
 
    /**
     * Request timers and enabled state stored on device 
     * @returns {Promise} resolves to ...; rejected on write fail or response timeout
     */
    getState: function(){
      
      var that = this;
      var promise = new RSVP.Promise(function(resolve,reject){
        
        // state request packet
        var payload = new Buffer([0xcc,0xaa,0x03,0x12,0x01,0x13]);
        var _timers = {};;
	var _enabled;
        var firstResponse = true;     
  
        var onData = function(buffer){
          // we need to buffer the data until 0x00 found
          if(buffer.length == 1 && buffer.readInt8(0) == 0){
            that.socket.removeListener('data',onData);
            resolve({enabled:_enabled,timers:_timers});
          }else{
            // parse response packet
            if(firstResponse){
              // first packet has enabled state of switch
              _enabled = Boolean(buffer.readInt8(7));
              firstResponse = false;
            }else{
              // each subsequent packet contains a timer
              var id        = buffer.readInt8(0);
              var repeats   = buffer.readInt8(1);
              var startTime = [badHex2dec(buffer.readInt8(2)),
                               badHex2dec(buffer.readInt8(3))];
              var endTime   = [badHex2dec(buffer.readInt8(4)),
                               badHex2dec(buffer.readInt8(5))];
              var enabled   = Boolean(buffer.readInt8(6));
              var name      = buffer.toString('utf8',7); 
            
              _timers[id]   = new BTapsTimer(id,name,startTime,endTime,enabled);
              _timers[id].repeatDayByte = repeats;
            }
          }
        };

        that.socket.on('data',onData);
  
        that.__write(payload).then(function(){
          setTimeout(function() {
            reject(new Error('Timed out'));
          },1000);
        },reject);

      });

      return promise;
    },

    /**
     * Set enabled and timers members from response from getState()
     * @private
     * @returns {Promise} resolves on successful update; rejected on write fail or response timeout
     */
    __updateState: function(){
      var that = this;
      var promise = new RSVP.Promise(function(resolve,reject){
        that.getState().then(function(resp){
          // set BTaps object members with response values
          that.timers = resp.timers;
          that.enabled = resp.enabled;
          resolve();
        },function(reason){reject(reason)});
      });
      return promise;
    }
};

/** 
 * Timer datatype for PS-BTaps1 switch
 * @constructor BTapsTimer
 * @param {Number} id - numeric identifier for timer, [0,255]
 * @param {String} name - text identifier for timer, upto 16 characters
 * @param {Number[]} startTime - time the switch becomes enabled, [hour,minute]
 * @param {Number[]} endTime - time the switch becomes disabled, [hour,minute]
 * @param {Boolean} enabled - timer active flag
 */
var BTapsTimer = function(id,name,startTime,endTime,enabled){
    
    /**
     * Numeric identifier for timer, [0,255]
     * @type {Number}
     */
    this.id            = id;      
    
    /** 
     * Text identifier for timer, upto 16 characters
     * @ {String}
     */
    this.name          = name;     
 
    /**  
     * Time the switch becomes enabled, [hour,minute]
     * @type {Number[]}
     */
    this.startTime     = startTime; 
    
    /**  
     * Time the switch becomes disabled, [hour,minute]
     * @type {Number[]}
     */
    this.endTime       = endTime;   
  
    /**
     * Timer active flag
     * @type {Boolean}
     */
    this.enabled       = enabled;    
    
    /**
     * Days on which the timer should be repeated - 8-bit integer, bits 1-7 represent Monday thru Sunday (1=active, 0=inactive), bit 0 is always reserved (value = 0).
     * @type {Number}
     */
    this.repeatDayByte = 0x00;      
};


/**
 *  Helper to convert decimal value to "bad hex" value (10 -> 0x10)
 *  @private
 *  @param {Number} dec - decimal value to convert
 *  @returns {Number} converted value
 */
var dec2badHex = function(dec){
    return parseInt('0x'+dec);
};

/**
 *  Helper to convert "bad hex" value to decimal (0x10 -> 10)
 *  @private
 *  @param {Number} badHex - hex value to convert
 *  @returns {Number} converted value
 */
var badHex2dec = function(badHex){
    return parseInt(badHex.toString(16));
};



module.exports.BTaps = BTaps;
module.exports.BTapsTimer = BTapsTimer;
