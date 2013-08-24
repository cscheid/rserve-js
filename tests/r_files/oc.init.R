wrap.javascript.function <- function(s)
{
  if (class(s) != "javascript_function")
    stop("Can only wrap javascript_function s");
  function(...) {
    Rserve:::self.oobMessage(list(s, ...))
  }
}

first.caps <- function()
{
  x <- 3
  stored.ocap <- NULL
  cat("INIT!\n")
  list(t1=make.oc(function(v) {
    cat("UP!\n")
    x <<- x + v
    x
  }), t2=make.oc(function(v) {
    cat("DOWN!\n")
    x <<- x - v
    x
  }), t3=make.oc(function(v) {
    print(v)
    stored.ocap <<- wrap.javascript.function(v)
    TRUE
  }), t4=make.oc(function(v) {
    stored.ocap(v)
  }))
}

####################################################################################################
# make.oc turns a function into an object capability accessible from the remote side

make.oc <- function(fun)
{
  .Call("Rserve_oc_register", fun)
}

# oc.init must return the first capability accessible to the remote side
oc.init <- function()
{
  make.oc(first.caps)
}
