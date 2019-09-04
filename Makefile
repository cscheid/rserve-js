# Detect if we're running Windows
ifeq ($(OS),Windows_NT)
	# If so, set the file & folder deletion commands:
	FixPath = $(subst /,\,$1)
	Remove = CMD.EXE /C DEL /F
	ReadFile = TYPE
	WritePerm = ICACLS $1 /GRANT $(USERNAME):(W)
else
	# Otherwise, assume we're running *N*X:
	FixPath = $1
	Remove = rm -f
	ReadFile = cat
	WritePerm = chmod -w $1
endif

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
	@$(Remove) $@
	$(call FixPath, node $(JS_COMPILER)) < $< > $@
	$(call WritePerm, $@)

rserve.js: Makefile
	@echo $^
	@$(Remove) $@
	$(ReadFile) $(call FixPath, $(filter %.js,$^)) > $@
ifeq ($(CHECK),1) 
	jshint $(filter %.js,$(filter-out lib/%.js,$(filter-out %/_begin.js,$(filter-out %/_end.js, $^))))
endif
	$(call WritePerm, $@)

main.js: Makefile
	@echo $^
	@$(Remove) $@
	$(ReadFile) $(call FixPath, $(filter %.js,$^)) > $@
ifeq ($(CHECK),1) 
	jshint $(filter %.js,$(filter-out lib/%.js,$(filter-out %/_begin.js,$(filter-out %/_end.js, $^))))
endif
	$(call WritePerm, $@)

clean:
	$(Remove) rserve.js rserve.min.js main.js
