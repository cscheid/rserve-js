first.caps <- function()
{
  x <- 3
  cat("INIT!\n")
  list(t1=make.oc(function() {
    cat("UP!\n")
    x <<- x + 1
    x
  }), t2=make.oc(function() {
    cat("DOWN!\n")
    x <<- x - 1
    x
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
