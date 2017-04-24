btaps-node 
==========
.. image:: https://travis-ci.org/mcourtne/btaps-node.svg?branch=master
   :target: https://travis-ci.org/mcourtne/btaps-node

.. image:: https://coveralls.io/repos/github/mcourtne/btaps-node/badge.svg?branch=master
   :target: https://coveralls.io/github/mcourtne/btaps-node?branch=master


This project is a library for communicating with a `Plugable PS-BTAPS1 Bluetooth Home Automation Switch`_ in Node.js. The work is based on a `Python library`_ for the same device.

Dependencies
____________
 - `bluetooth-serial-port`_
 - `rsvp`_

APIs
____
.. toctree::
   :maxdepth: 1

   BTaps
   BTapsTimer

TODO
____
 - Improve Mocha tests
 - Create an `OpenHAB`_ binding for the Plugable hardware

.. _Plugable PS-BTAPS1 Bluetooth Home Automation Switch: http://plugable.com/products/ps-btaps1/
.. _bluetooth-serial-port: https://www.npmjs.com/package/bluetooth-serial-port
.. _rsvp: https://github.com/tildeio/rsvp.js/
.. _Python library: https://github.com/bernieplug/plugable-btaps
.. _OpenHAB: https://www.openhab.org
