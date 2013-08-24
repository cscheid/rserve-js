library(Rserve)

wrap.js.fun <- function(s)
{
  if (class(s) != "javascript_function")
    stop("Can only wrap javascript_function s");
  function(...) {
    self.oobMessage(list(s, ...))
  }
}

wrap.r.fun <- function(fun)
{
  .Call("Rserve_oc_register", fun)
}

give.first.functions <- function()
{
  x <- 3
  javascript.function <- NULL
  cat("INIT!\n")
  list(t1=wrap.r.fun(function(v) {
    cat("UP!\n")
    x <<- x + v
    x
  }), t2=wrap.r.fun(function(v) {
    cat("DOWN!\n")
    x <<- x - v
    x
  }), t3=wrap.r.fun(function(v) {
    javascript.function <<- wrap.js.fun(v)
    TRUE
  }), t4=wrap.r.fun(function(v) {
    javascript.function(v)
  }))
}

####################################################################################################
# make.oc turns a function into an object capability accessible from the remote side

# oc.init must return the first capability accessible to the remote side
oc.init <- function()
{
  wrap.r.fun(give.first.functions)
}
