library(Rserve)

wrap.js.fun <- function(s)
{
  if (class(s) != "javascript_function")
    stop("Can only wrap javascript_function s");
  function(...) {
    self.oobMessage(list(s, ...))
  }
}

wrap.r.fun <- Rserve:::ocap

give.first.functions <- function()
{
  x <- 3
  javascript.function <- NULL
  naked.javascript.function <- NULL
  cat("INIT!\n")
  list(t1=wrap.r.fun(function(v) {
    cat("UP!\n")
    x <<- x + v
    x
  }, "t1"), t2=wrap.r.fun(function(v) {
    cat("DOWN!\n")
    x <<- x - v
    x
  }, "t2"), t3=wrap.r.fun(function(v) {
    javascript.function <<- wrap.js.fun(v)
    TRUE
  }, "t3"), t4=wrap.r.fun(function(v) {
    javascript.function(v)
  }, "t4"), t5=wrap.r.fun(function(v) {
    naked.javascript.function <<- v
    NULL
  }, "t5"), t6=wrap.r.fun(function(v) {
    list(naked.javascript.function, v)
  }, "t6"))
}

####################################################################################################
# make.oc turns a function into an object capability accessible from the remote side

# oc.init must return the first capability accessible to the remote side
oc.init <- function()
{
  wrap.r.fun(give.first.functions)
}
