#!/usr/bin/node
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')( http );
var port = process.env.PORT || 3000;
var amqp = require('amqplib/callback_api');

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
  //res.send( JSON.stringify( securities ) + JSON.stringify( markets ) );
});

var securities = [];
var markets = [];


class Market {
  constructor ( mic, state="CLOSED" )
  {
    this.mic = mic;
    this.state = "CLOSED";
  }
  
  updateState( state )
  {
    this.state = state;
  }
}

class Security {
  constructor ( ticker, bid=0, ask=0, bidsz=0, asksz=0, last=0, lastsz=0, halt=false, ia=false )
  {
    this.ticker = ticker;
    this.bid = bid;
    this.ask = ask;
    this.last = last;
    this.lastsz = lastsz;
    this.bidsz=bidsz;
    this.asksz=asksz;
    if (halt == true)
      this.status='halt';
    else if (ia == true )
      this.status='ia';
    else
      this.status='';

  }
  updateQuote( bid, ask, bidsz, asksz, halt=false, ia=false )
  {
    this.bid = bid;
    this.ask = ask;
    this.asksz = asksz;
    this.bidsz = bidsz;
    if (halt == true)
      this.status='halt';
    else if (ia == true )
      this.status='ia';
    else
      this.status='';
  }
  updateTrade( last, lastsz )
  {
    this.last = last;
    this.lastsz = lastsz;
  }
}

function checkTicker( security )
{
  return security.ticker == this.ticker;
}

amqp.connect('amqp://localhost', function(err, conn) {
  conn.createChannel(function(err, ch) {
    var ex = 'rt_feeds';

    ch.assertExchange(ex, 'topic', {durable: false});

    ch.assertQueue('', {exclusive: true}, function(err, q) {
      ch.bindQueue(q.queue, ex, '#');

      ch.consume(q.queue, function(msg) {
        var m = JSON.parse( msg.content );

        if ( m.t == "Q" ) 
        {
          ix =  securities.findIndex( x => x.ticker === m.sym );
          if ( ix >= 0)
          {
            securities[ ix ].updateQuote( m.b, m.a, m.as, m.bs, m.hi, m.ia );
          }
          else
          {
            securities.push( new Security( m.sym, m.b, m.a, m.as, m.bs, 0, 0, m.hi, m.ia ) );
          }
        }
        else if ( m.t == 'T' )
        {
          ix =  securities.findIndex( x => x.ticker === m.sym );
          if ( ix >= 0)
          {
            securities[ ix ].updateTrade( m.p, m.s );
          }
          else
          {
            securities.push( new Security( m.sym, 0, 0, 0, 0, m.p, m.s ) );
          }

        }
        else if ( m.t == "M" )
        {
          ix = markets.findIndex( x => x.mic === m.ex );
          if ( ix >= 0 )
          {
            markets[ ix ].updateState( m.st );
          }
          else
          {
            markets.push( new Market( m.ex ) );
          }
        }
        else
        {
          console.log( "%s", msg.content );
        }
      }, {noAck: true});
    });
  });
});


io.on('connection', function(socket){
  socket.emit('quotelines', JSON.stringify( securities ));
  setInterval( function() { socket.emit('quotelines', JSON.stringify( securities ) ); }, 250 );
  setInterval( function() { socket.emit('marketstatus', JSON.stringify( markets ) ); }, 250 );
});

http.listen(port, function(){
  console.log('listening on *:' + port);
});
