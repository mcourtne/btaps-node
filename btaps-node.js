var RSVP = require('rsvp');

var BTaps = function(btaddr){
    this.socket = new (require('bluetooth-serial-port')).BluetoothSerialPort();
    this.btaddr = btaddr; // bluetooth address
    this.timers = {};  // array of timer indices
    this.enabled = false;
};

BTaps.prototype = {

    __write: function(payload){
      var that = this;
      var write = RSVP.denodeify(this.socket.write.bind(this.socket));
      var promise = new RSVP.Promise(function(resolve,reject){
        
        that.socket.once('data',function(data){
          resolve(data);
        });
        write(payload).then(function(){
          setTimeout(function() {
            reject(new Error('Timed out'));
            }, 1000);
        },reject);
      });

      return promise;
    },

    // connect to bluetooth address specified in constructor
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

    // disconnect from bluetooth
    disconnect: function(){
      this.socket.close();
    },

    // set the state of the switch (On/Off)
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

    __setTimer: function(timer,create){
      var that = this;
      var promise = new RSVP.Promise(function(resolve,reject){
    
        if(!(timer instanceof BTapsTimer)){          
          reject(new Error('Timer argument in '+create?'createTimer()':'modifyTimer()'+'must be a BTapsTimer object.'));
        }
       
        var startTime = timer.getStartTime_badHex();
        var endTime = timer.getEndTime_badHex();
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

        that.__write(packet).then(function(){ 
          that.timers[timer.id] = timer;
          resolve();
        },function(reason){
          reject(reason);
        });

      });

      return promise;
    },

    createTimer: function(timer){
        // forward promise
        return this.__setTimer(timer,true);
    },
    
    modifyTimer: function(timer){
        // forward promise
        return this.__setTimer(timer,false);
    },

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
        that.__write(payload).then(function(){
          delete that.timers[timer_id];
          resolve();
        },function(reason){
          reject(reason);
        });
      });
      return promise;
    },
 
    // method to request timers and enabled state stored on device 
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

    // set state of BTaps object timers and enabled members with values from connected device
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


var BTapsTimer = function(id,name,startTime,endTime,enabled){
    this.id            = id;         // integer between 0 and 255 (inclusive)
    this.name          = name;       // string up to 16 characters
    this.startTime     = startTime;  // 2-tuple: hour,minute
    this.endTime       = endTime;    // 2-tuple: hour,minute
    this.enabled       = enabled;    // boolean
    this.repeatDayByte = 0x00;       // bits 1-7 represent Monday thru Sunday
                                     // bit 0 always zero 
};

BTapsTimer.prototype = {

    getStartTime_badHex: function(){
        return [dec2badHex(this.startTime[0]),dec2badHex(this.startTime[1])];
    },

    getEndTime_badHex: function(){
        return [dec2badHex(this.endTime[0]),dec2badHex(this.endTime[1])];
    }
};

/* HELPERS */
// 10 -> 0x10
var dec2badHex = function(dec){
    return parseInt('0x'+dec);
};
// 0x10 -> 10
var badHex2dec = function(badHex){
    return parseInt(badHex.toString(16));
};



module.exports.BTaps = BTaps;
module.exports.BTapsTimer = BTapsTimer;
