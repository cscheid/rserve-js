hello.world <- function()
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

make.oc <- function(fun)
{
  .Call("Rserve_oc_register", fun)
}

oc.init <- function()
{
  make.oc(hello.world)
}
