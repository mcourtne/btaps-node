var btaps = require('../btaps-node'); 
var sinon = require('sinon');
var assert = require('chai').assert; 
var bufferEqual = require('buffer-equal');

describe("btaps-node",function(){

  var bto;
  var test_chn = 123;
  
  beforeEach(function(){
    bto = new btaps.BTaps("myAddress");
    // add sinon stubs
    stub_write = sinon.stub(bto.socket,'write').callsFake(function(payload,callback){
      // done response for getState()
      bto.socket.emit('data',new Buffer([0x00]));
      // write succeeded
      callback(false,payload.length);
    });
    stub_close = sinon.stub(bto.socket,'close');
    stub_isOpen = sinon.stub(bto.socket,'isOpen');
    stub_channelSearchSucceed = sinon.stub(bto.socket,'findSerialPortChannel').callsArgWithAsync(1,test_chn);
    stub_connectSucceed = sinon.stub(bto.socket,'connect').callsArg(2);
  });

  afterEach(function(){
    // clean up sinon stubs
    stub_write.restore();
    stub_close.restore();
    stub_isOpen.restore();
    stub_channelSearchSucceed.restore();
    stub_connectSucceed.restore();
  });

  it("connect() should search for channels on btaddr provided in constructor",function(done){
    bto.connect().then(function(){
      assert.equal(bto.btaddr,stub_channelSearchSucceed.getCalls()[0].args[0]);
      done();
    },function(reason){
      done("Promise resolved.");
    }).catch(done);
  });

  describe("channel search succeeded", function(){
      
    it("connect() should attempt to connect to btaddr and found channel",function(done){
      bto.connect().then(function(){
        assert.equal(bto.btaddr,stub_connectSucceed.getCalls()[0].args[0]);
        assert.equal(test_chn,
                     stub_connectSucceed.getCalls()[0].args[1]);
        done();
      },function(){
        done('Promise resolved.');
      }).catch(done);
    });
        
    describe("connect succeeded",function(){

      var timer = new btaps.BTapsTimer(1,'Test',[10,1],[11,2],true);
      timer.repeatDayByte = 5;  

      it("disconnect() should close socket",function(){
          bto.disconnect();
          sinon.assert.called(stub_close);
      });

      describe("timers",function(){

        it("getStartTime_badHex()",function(){
          var ret = timer.getStartTime_badHex();
          assert.equal(ret[0],0x10);
          assert.equal(ret[1],0x01);
        });        

        it("getEndTime_badHex()",function(){
          var ret = timer.getEndTime_badHex();
          assert.equal(ret[0],0x11);
          assert.equal(ret[1],0x02);
        });

        it("modifyTimer()",function(done){
          bto.modifyTimer(timer).then(function(){
            var args = stub_write.getCalls()[0].args;
            assert.lengthOf(args,2);
            assert.instanceOf(args[0],Buffer);
            assert.isTrue(bufferEqual(args[0],
              new Buffer([0xcc,0xaa,0x1a,0x03,0x01,0x01,0x05,0x10,0x01,0x11,0x02,0x01],29)));
            done();
          }).catch(done);
        });

        it("createTimer()",function(done){
          bto.createTimer(timer).then(function(){
            var args = stub_write.getCalls()[0].args;
            assert.lengthOf(args,2);
            assert.instanceOf(args[0],Buffer);
            assert.isTrue(bufferEqual(args[0],
              new Buffer([0xcc,0xaa,0x1a,0x20,0x01,0x01,0x05,0x10,0x01,0x11,0x02,0x01],29)));
            done();
          }).catch(done); 
        });

        it("deleteTimer(id)",function(done){
          bto.deleteTimer(timer.id).then(function(){
            var args = stub_write.getCalls()[0].args;
            assert.lengthOf(args,2);
            assert.instanceOf(args[0],Buffer);
            assert.isTrue(bufferEqual(args[0],
              new Buffer([0xcc,0xaa,0x04,0x19,0x01,0x01,0x01])));
            done();
          }).catch(done);
        });
        
        it("deleteTimer(timer)",function(done){
          bto.deleteTimer(timer).then(function(){
            var args = stub_write.getCalls()[0].args;
            assert.lengthOf(args,2);
            assert.instanceOf(args[0],Buffer);
            assert.isTrue(bufferEqual(args[0],
              new Buffer([0xcc,0xaa,0x04,0x19,0x01,0x01,0x01])));
            done();
          }).catch(done);
        }); 

      });

      describe("state",function(){ 
        beforeEach(function(){
          stub_write.restore();
          stub_writeState = sinon.stub(bto.socket,'write').callsFake(function(payload,callback){
            // send state of switch
            this.emit('data',new Buffer([0,0,0,0,0,0,0,0x01]));
            // send timer: id=1,repeat=5,start=[10,1],end=[11,2],enabled=true,name='test'
            this.emit('data',new Buffer([0x01,0x05,0x10,0x01,0x11,0x02,0x01,116,101,115,116],23));
            // end response
            this.emit('data',new Buffer([0x00]));
            
            callback(false,payload.length);
          });
        });

        afterEach(function(){
          stub_writeState.restore();
        });

        it("connect() should update state on successful connection",function(done){
          assert.isFalse(bto.enabled);
          assert.lengthOf(Object.keys(bto.timers),0);
          bto.connect().then(function(){
            assert.isTrue(bto.enabled);
            assert.lengthOf(Object.keys(bto.timers),1);
            assert.property(bto.timers,'1');
            done();
          }).catch(done);
        });
        
        it("getState()",function(done){
          bto.getState().then(function(obj){
            assert.isObject(obj);

            //check timers property
            assert.property(obj,'timers');
            assert.property(obj.timers,'1');
            var aTimer = obj.timers[1];
            assert.instanceOf(aTimer,btaps.BTapsTimer);
            var eTimer = new btaps.BTapsTimer(1,'test',[10,1],[11,2],true);
            eTimer.repeatDayByte = 5;  
            assert.deepEqual(aTimer,eTimer);

            //check enabled property
            assert.property(obj,'enabled');
            assert.equal(obj.enabled,true);

            done();
          }).catch(done);
        });

      });
    
      describe("switch", function() {

        it("should send request over bluetooth serial socket",function(done){
          bto.setSwitch(true).then(function(){
            sinon.assert.called(stub_write);
            arg0 = stub_write.getCalls()[0].args[0];
            assert.instanceOf(arg0,Buffer);
            done();
          },function(reason){done('Promise rejected: '+reason);}).catch(done);
        });
        
        describe('write failed', function(){
    
          beforeEach(function(){
            stub_write.restore();
            stub_write_fail = sinon.stub(bto.socket,'write').callsArgWith(1,'write failed');
          });

          afterEach(function(){
            stub_write.restore();
          });

          it("createTimer() should forward socket write Errors",function(done){
            bto.createTimer(timer).then(function(){
              done('Promise resolved.');
            },function(reason){
              assert.equal(reason,'write failed');
              done(); 
            }).catch(done);
          });

          it("modifyTimer() should forward socket write Errors",function(done){
            bto.modifyTimer(timer).then(function(){
             done('Promise resolved.');
            },function(reason){
              assert.equal(reason,'write failed');
              done(); 
            }).catch(done);
          });

          it("deleteTimer() should forward socket write Errors",function(done){
            bto.deleteTimer().then(function(){
              done('Promise resolved.');
            },function(reason){
              assert.equal(reason,'write failed');
              done();
            }).catch(done);
          });
          
          it("setSwitch() should forward socket write Errors",function(done){
            bto.setSwitch(false).then(function(){
              done('Promise resolved.');
            },function(reason){
              assert.equal(reason,'write failed');
              done(); 
            }).catch(done);
          });
          
          it("getState() should forward socket write Errors",function(done){
            bto.getState().then(function(){
              done('Promise resolved.');
            },function(reason){
              assert.equal(reason,'write failed');
              done(); 
            }).catch(done);
          });
 
        }); 
      });
    });
    
    describe("connect failed",function(){

      beforeEach(function(){
        bto.socket.connect.restore(); 
        stub_connectFail = sinon.stub(bto.socket,'connect').callsArgWith(3,new Error('connect failed'));
      });

      afterEach(function(){
        stub_connectFail.restore();
      });
 
      it("connect() should reject with Error when socket.connect errors",function(done){
        bto.connect().then(function(){
          done('Promise resolved.'); 
        },function(reason){
          assert.instanceOf(reason,Error);
          done();
        }).catch(done);
      });
      
    });

  });

  describe("channel search failed", function() {

    beforeEach(function(){
      bto.socket.findSerialPortChannel.restore();
      stub_channelSearchFail = sinon.stub(bto.socket,'findSerialPortChannel').callsArg(2);
    });

    afterEach(function(){
      stub_channelSearchFail.restore();
    });
   
    it("connect() should reject with Error when channels are not found", function(done){
      bto.connect().then(function(){
        done('Promise resolved.');
      },function(reason){
        assert.instanceOf(reason,Error);
        done();
      }).catch(done);
    });
      
  });

});
