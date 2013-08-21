## check that RCloud is properly installed
##installed <- gsub(".*/([^/]+)/DESCRIPTION$","\\1",Sys.glob(paste0(.libPaths(),"/*/DESCRIPTION")))

debug <- FALSE # isTRUE(nzchar(Sys.getenv("DEBUG")))
Rserve::Rserve(debug, args=c("--RS-conf", "r_files/oc.conf", "--RS-source", "r_files/oc.init.R", "--vanilla", "--no-save"))
