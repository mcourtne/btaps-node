var btaps = require('../btaps-node'); 
var sinon = require('sinon');
var assert = require('chai').assert; 

describe("btaps-node",function(){

  var bto = new btaps.BTaps("myAddress");
  var stub_res = sinon.stub().throws();
  var stub_err = sinon.stub().throws();
  var test_chn = 123;

  beforeEach(function(){
    // add sinon stubs
    stub_write = sinon.stub(bto.socket,'write').callsArg(1);
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

  it("connect() should search for channels on btaddr provided in constructor",function(){
    bto.connect().then(function(){
      assert.isOk(false)
    },function(reason){
      assert.equal(bto.btaddr,stub_channelSearchFail.getCalls()[0].args[0]);
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
   
    it("connect() should reject with Error when channels are not found", function(){
      bto.connect().then(function(){
        assert.isOk(false)
      },function(reason){
        assert.instanceOf(reason,Error);
      });
    });
      
  });

  describe("channel search succeeded", function(){
      
    it("connect() should attempt to connect to btaddr and found channel",function(){
      bto.connect().then(function(){assert.isOk(false)},function(reason){
        assert.equal(bto.btaddr,stub_connectFail.getCalls()[0].args[0]);
        assert.equal(test_chn,
                     stub_connectFail.getCalls()[0].args[1]);
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
 
      it("connect() should reject with Error when socket.connect errors",function(){
        bto.connect().then(function(){assert.isOk(false)},function(reason){
          assert.instanceOf(reason,Error);
        });
      });
      
    });

    describe("connect succeeded",function(){

      //it("connect() should update timers on successful connection");

      it("disconnect() should close socket",function(){
        bto.connect().then(function(){
          bto.disconnect();
          assert.called(stub_close);
        },function(){assert.isOk(false);});
      });
    
      describe("switch", function() {

        it("should send request over bluetooth serial socket",function(){
          bto.setSwitchState(true).then(function(){
            assert.called(stub_write);
            arg0 = stub_write.getCalls()[0].args[0];
            assert.isInstance(arg0,Buffer);
          },function(){assert.isOK(false);}); 
        });
        
        describe('write failed', function(){
    
          beforeEach(function(){
            bto.socket.write.restore();
            stub_write_fail = sinon.stub(bto.socket,'write').callsArgWith(1,true);
          });

          afterEach(function(){
            bto.socket.write.restore();          
          });

          it("should forward socket write Errors",function(){
            bto.setSwitchState(false).then(function(){assert.isOk(false);},function(reason){
             assert.instanceOf(reason,Error); 
            });
          });
 
        }); 
      });
    });
  });
});
