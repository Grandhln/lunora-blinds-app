const http = require('http');

const data = JSON.stringify({
  customerName: "API Test",
  blinds: [
    {
      location: "Living Room",
      width: "50",
      height: "50",
      mountType: "Inside",
      colorCode: "White",
      mechanism: "Manual",
      blindType: "Roller"
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/sheets',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);

  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
