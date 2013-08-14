JS_COMPILER = ./node_modules/uglify-js/bin/uglifyjs

all: rserve.js rserve.min.js main.js

main.js:					\
	src/_begin.js				\
	src/_begin_node.js			\
	src/robj.js				\
	src/rsrv.js				\
	src/parse.js				\
	src/endian_aware_dataview.js		\
	src/rserve.js				\
	src/error.js				\
	src/write.js				\
	src/_end.js				\
	src/_end_node.js

rserve.js:					\
	src/_begin.js				\
	src/robj.js				\
	src/rsrv.js				\
	src/parse.js				\
	src/endian_aware_dataview.js		\
	src/rserve.js				\
	src/error.js				\
	src/write.js				\
	src/_end.js

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

main.js: Makefile
	echo $^
	@rm -f $@
	cat $(filter %.js,$^) > $@
ifeq ($(CHECK),1) 
	jshint $(filter %.js,$(filter-out lib/%.js,$(filter-out %/_begin.js,$(filter-out %/_end.js, $^))))
endif
	chmod -w $@

clean:
	rm -f rserve.js rserve.min.js main.js
