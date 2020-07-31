# Active Route Manager

Optimize hardware forwarding by identifying most active routes:

https://blog.sflow.com/2016/07/internet-router-using-merchant-silicon.html

https://blog.sflow.com/2016/12/ipv6-internet-router-using-merchant.html


# Requirements

- Apache
- php
- prometheus
- python request library

Apache and php :
`apt-get install apache2 php php-common libapache2-mod-php php-cli`

Prometheus database:
`apt-get install prometheus`

Python requests library
```
git clone git://github.com/psf/requests.git
cd requests
pip install .
```

# Installation

1. [Download sFlow-RT](https://sflow-rt.com/download.php)
2. Run command: `sflow-rt/get-app.sh Broccoli1337 active-routes`
3. Restart sFlow-RT
4. Copy `active-routes/html/topprefixes.php` in `/var/www/html/topprefix.php`
5. Add entry to prometheus configuration

```
- job_name: sflow-rt-bgp-top_prefix
  metrics_path: /topprefix.php
  params:
    top: [1000]
  static_configs:
  - targets: [localhost]
```

# Configuration

Send mails for each update
```
plugins.mailFrom=mail@from.com
arm.target.mail_to=your@mail.com #List of mail addresses for sending updates
```

Define updates variables
```
# SDN configuration
#Top prefixes
arm.target.prefixes=300

#Update interval
arm.target.updateInterval=6

#Top prefixes calculation
arm.target.period=24h
```

# Prometheus configuration

Add topprefix.php to `scrape_config` in prometheus configuration :

```
- job_name: sflow-rt-bgp-top_prefix
  metrics_path: /topprefix.php
  static_configs:
  - targets: [localhost]
```

# Example of an alert mail

```
Sflow-rt prefixes updates :
Added : 6
Updated : 294
Removed : 6

Top 10 prefixes(1h) :
Prefix :     10.0.0.0/8 ,nexthop :     127.0.0.1 ,value(bytes) :           100 G


Added prefixes :
Prefix :     10.0.0.0/8 ,nexthop :     127.0.0.1 ,value(bytes) :           100 G


Removed prefixes :
Prefix :     10.0.0.0/8 ,nexthop :     127.0.0.1 ,value(bytes) :           100 G

```
