const {parse} = require('url');
//router is helper that can route a request to the function that can handle it
module.exports = class Router {
  constructor(){
    this.routes = []
  }
  //function to add new handler functions to different url routes
  add(method, url, handler){
    this.routes.push({method, url, handler})
  }
  //resolves requests. Context will be our server instance in this case
  resolve(context, request){
    let path = parse(request.url).pathname;

    for (let {method, url, handler} of this.routes) { //extract method, url and handler for each element of routes array
      let match = url.exec(path);
      if (!match || request.method != method) continue; //if no match, continue next loop (do nothing)

      //returns response when a handler was found
      let urlParts = match.slice(1).map(decodeURIComponent);
      return handler(context, ...urlParts, request)
    }
    return null;
  }
};
