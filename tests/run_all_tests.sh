#!/bin/bash

echo This test suite will kill all running instances of Rserve!
killall Rserve
echo Starting no-ocap rserve..
./r_files/start_no_ocap >/dev/null 2>&1
sleep 2
node no_ocap_tests.js
killall Rserve
echo Starting ocap rserve..
./r_files/start >/dev/null 2>&1
sleep 2
node ocap_tests.js
killall Rserve
