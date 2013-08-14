JS_COMPILER = ./node_modules/uglify-js/bin/uglifyjs

all: rserve.js rserve.min.js

rserve.js: \
	js/endian_aware_dataview.js \
	js/rserve.js

rserve.min.js: rserve.js Makefile
	@rm -f $@
	$(JS_COMPILER) < $< > $@
	chmod -w $@

rserve.js: Makefile
	echo $^
	@rm -f $@
	cat $(filter %.js,$^) > $@
ifeq ($(CHECK),1) 
	jshint $(filter %.js,$(filter-out lib/%.js,$(filter-out %/_begin.js,$(filter-out %/_end.js, $^))))
endif
	chmod -w $@

clean:
	rm -f rserve.js rserve.min.js
