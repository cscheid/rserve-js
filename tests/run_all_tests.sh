#!/bin/bash

echo This test suite will kill all running instances of Rserve!

killall Rserve
echo Starting no-ocap rserve..
./r_files/start_no_ocap
sleep 2
node no_ocap_tests.js

killall Rserve
echo Starting ocap rserve..
./r_files/start
sleep 2
node ocap_tests.js # --debug-brk 
killall Rserve
