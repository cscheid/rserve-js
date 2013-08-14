hello.world <- function()
{
  cat("hello world!")
}

make.oc <- function(fun)
{
  .Call("Rserve_oc_register", fun)
}

oc.init <- function()
{
  make.oc(hello.world)
}
