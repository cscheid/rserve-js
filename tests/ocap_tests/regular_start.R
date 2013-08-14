## check that RCloud is properly installed
##installed <- gsub(".*/([^/]+)/DESCRIPTION$","\\1",Sys.glob(paste0(.libPaths(),"/*/DESCRIPTION")))

debug <- isTRUE(nzchar(Sys.getenv("DEBUG")))
Rserve::Rserve(debug, args=c("--RS-conf", "no_oc.conf", "--vanilla", "--no-save"))
