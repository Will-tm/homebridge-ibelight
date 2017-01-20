var Service, Characteristic;
var dgram = require('dgram');
var client = dgram.createSocket('udp4');
var color = require('onecolor');

var gamma = [];
for (var i = 0; i < 256; i++) {
  gamma[i] = Math.pow(parseFloat(i) / 255.0, 2.5) * 255.0;
}

const stepsToGo = 70.0;

function format(str, arr) {
    var i = -1;
    function callback(exp, p0, p1, p2, p3, p4) {
        if (exp=='%%') return '%';
        if (arr[++i]===undefined) return undefined;
        var exp  = p2 ? parseInt(p2.substr(1)) : undefined;
        var base = p3 ? parseInt(p3.substr(1)) : undefined;
        var val;
        switch (p4) {
            case 's': val = arr[i]; break;
            case 'c': val = arr[i][0]; break;
            case 'f': val = parseFloat(arr[i]).toFixed(exp); break;
            case 'p': val = parseFloat(arr[i]).toPrecision(exp); break;
            case 'e': val = parseFloat(arr[i]).toExponential(exp); break;
            case 'x': val = parseInt(arr[i]).toString(base?base:16); break;
            case 'd': val = parseFloat(parseInt(arr[i], base?base:10).toPrecision(exp)).toFixed(0); break;
        }
        val = typeof(val)=='object' ? JSON.stringify(val) : val.toString(base);
        var sz = parseInt(p1); /* padding size */
        var ch = p1 && p1[0]=='0' ? '0' : ' '; /* isnull? */
        while (val.length<sz) val = p0 !== undefined ? val+ch : ch+val; /* isminus? */
       return val;
    }
    var regex = /%(-)?(0?[0-9]+)?([.][0-9]+)?([#][0-9]+)?([scfpexd])/g;
    return str.replace(regex, callback);
}

function writeColor(newColor, host, port) {
  var r = gamma[Math.trunc(newColor.red()   * 255)];
  var g = gamma[Math.trunc(newColor.green() * 255)];
  var b = gamma[Math.trunc(newColor.blue()  * 255)];

  var str = format('%03d%03d%03d',[r,g,b]);
  var message = new Buffer(str);

  client.send(message, 0, message.length, port, host, function(err, bytes) {
    if (err) throw err;
  });
}

function terminateTimerEvent(id) {
  if (id != null) clearInterval(id);
  id = null;
}

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-ibelight", "iBeLight", iBeLight);
}

function iBeLight(log, config) {
    this.log = log;

    // url info
    this.host = config["host"];
    this.port = config["port"];
    this.name = config["name"] || "iBeLight";
    this.manufacturer = config["manufacturer"] || "";
    this.model = config["model"] || "Model not available";
    this.serial = config["serial"] || "Non-defined serial";

    this.timerIdH = null;
    this.timerIdS = null;
    this.timerIdV = null;

    this.ledsColor = color('blue');
    this.lastValue = this.ledsColor.value();
    this.ledsColor = this.ledsColor.value(255);
    this.power = true;
}

iBeLight.prototype = {

    setNextColorValue: function(value, callback) {
      let self = this;
      terminateTimerEvent(self.timerIdV);

      var steps = stepsToGo;
      var step = (value - self.ledsColor.value()) / steps;

      self.timerIdV = setInterval(function () {
        writeColor(self.ledsColor, self.host, self.port);
        if (--steps <= 0) {
          self.ledsColor = self.ledsColor.value(value);
          writeColor(self.ledsColor, self.host, self.port);
          terminateTimerEvent(self.timerIdV);
          if (callback != null)
            callback();
        }
        self.ledsColor = self.ledsColor.value(self.ledsColor.value() + step);
      }, 5);
    },

    setNextColorHue: function(hue, callback) {
      let self = this;
      terminateTimerEvent(self.timerIdH);

      var steps = stepsToGo;
      var step = 0;
      var reversed = Math.abs(hue - self.ledsColor.hue()) > 0.5;
      if (reversed == false)
        step = (hue - self.ledsColor.hue()) / steps;
      else if (hue < self.ledsColor.hue())
        step = (1.0 - self.ledsColor.hue() + hue) / steps;
      else
        step = (1.0 - hue + self.ledsColor.hue()) / steps * -1.0;    

      self.timerIdH = setInterval(function () {
        writeColor(self.ledsColor, self.host, self.port);
        if (--steps <= 0) {
          self.ledsColor = self.ledsColor.hue(hue);
          writeColor(self.ledsColor, self.host, self.port);
          terminateTimerEvent(self.timerIdH);
          if (callback != null)
            callback();
        }
        var nextHue = self.ledsColor.hue() + step;
        self.ledsColor = self.ledsColor.hue(nextHue);
      }, 5);
    },

    setNextColorSaturation: function(saturation, callback) {  
      let self = this;
      terminateTimerEvent(self.timerIdS);

      var steps = stepsToGo;
      var step = (saturation - self.ledsColor.saturation()) / steps;

      self.timerIdS = setInterval(function () {
        writeColor(self.ledsColor, self.host, self.port);
        if (--steps <= 0) {
          self.ledsColor = self.ledsColor.saturation(saturation);
          writeColor(self.ledsColor, self.host, self.port);
          terminateTimerEvent(self.timerIdS);
          if (callback != null)
            callback();
        }
        self.ledsColor = self.ledsColor.saturation(self.ledsColor.saturation() + step);
      }, 5);
    },

    setState: function(value, callback) {
        this.power = value;
        this.log("Turning the '%s' %s", this.name, value ? "on" : "off");
        if (!this.power) {
            this.lastValue = this.ledsColor.value();
            this.setNextColorValue(0);
        } else {
            this.setNextColorValue(this.lastValue);
        }
        callback();
    },

    getState: function (callback) {
        this.log("'%s' is %s.", this.name, this.power ? "on" : "off");
        callback(null, this.power);
    },

    setBrightness: function(brightness, callback) {
        this.log("Setting '%s' brightness to %s", this.name, brightness);
        this.setNextColorValue(brightness/100.0, callback);
    },

    getBrightness: function(callback) {
        var brightness = this.ledsColor.value() * 100;
        this.log("'%s' brightness is %s", this.name, brightness);
        callback(null, brightness);
    },

    setSaturation: function(saturation, callback) {
        this.log("Setting '%s' saturation to %s", this.name, saturation);
        this.setNextColorSaturation(saturation/100.0, callback);
    },

    getSaturation: function(callback) {
        var saturation = this.ledsColor.saturation() * 100;
        this.log("'%s' saturation is %s", this.name, saturation);
        callback(null, saturation);
    },

    setHue: function(hue, callback) {
        this.log("Setting '%s' hue to %s", this.name, hue);
        this.setNextColorHue(hue/360.0, callback);
    },

    getHue: function(callback) {
        var hue = this.ledsColor.hue() * 360;
        this.log("'%s' hue is %s", this.name, hue);
        callback(null, hue);
    },

    identify: function (callback) {
        //this.log("Identify requested!");
        callback(); // success
    },

    getServices: function () {
        var service = new Service.AccessoryInformation();
        service.setCharacteristic(Characteristic.Name, this.name)
               .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
               .setCharacteristic(Characteristic.Model, this.model);

        var lightService = new Service.Lightbulb(this.name);

            lightService.getCharacteristic(Characteristic.On)
                        .on('set', this.setState.bind(this))
                        .on('get', this.getState.bind(this));

            lightService.getCharacteristic(Characteristic.Brightness)
                        .on('set', this.setBrightness.bind(this))
                        .on('get', this.getBrightness.bind(this));

            lightService.getCharacteristic(Characteristic.Saturation)
                        .on('set', this.setSaturation.bind(this))
                        .on('get', this.getSaturation.bind(this));

            lightService.getCharacteristic(Characteristic.Hue)
                        .on('set', this.setHue.bind(this))
                        .on('get', this.getHue.bind(this));

        return [service, lightService];
    }
};
