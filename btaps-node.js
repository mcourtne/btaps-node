var RSVP = require('rsvp');

var BTaps = function(btaddr){
    this.socket = new (require('bluetooth-serial-port')).BluetoothSerialPort();
    this.btaddr = btaddr; // bluetooth address
    this.timers = [];  // array of timer indices
};

BTaps.prototype = {

    // connect to bluetooth address specified in constructor
    connect: function(){
        
        // bind promise to BTaps object
        var that = this;

        // promise for connection request
        var promise = new RSVP.Promise(function(resolve, reject){
            that.socket.findSerialPortChannel(that.btaddr, function(channel){
                // channel found, connect to it
                that.socket.connect(that.btaddr,channel,function(){
                    
                    // TODO: get timers on connected device
                    // TODO: listen for socket close to remove timers                    
                    // resolve promise
                    resolve();
                
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
            // only attempt disconnect if socket is open
            if(this.socket.isOpen()){
                this.socket.close();
            }
    },

    // set the state of the switch (On/Off)
    setSwitchState: function(enabled){
        // bind promise to BTaps object 
        var that = this;
        
        // promise for setting switch state
        var promise = new RSVP.Promise(function(resolve,reject){
            
            var payload;
            if(enabled){
                // turn On
                payload = new Buffer([0xcc,0xaa,0x03,0x01,0x01,0x01]);
            }else{
                // turn Off
                payload = new Buffer([0xcc,0xaa,0x03,0x01,0x01,0x00]);
            }
            
            that.socket.write(payload,function(err,bytesWritten){
                if(err){
                    reject(err);
                }else{
                    resolve();
                }
            });
        });

        return promise;
    }

    // TODO: Timer functions
};

module.exports.BTaps = BTaps;

