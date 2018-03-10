const {parse} = require('url');

module.exports = class Router {
  constructor(){
    this.routes = []
  }
  //function to add new handlers
  add(method, url, handler){
    this.routes.push({method, url, handler})
  }
  //resolves requests. Context will be our server instance in this case
  resolve(context, request){
    let path = parse(request.url).pathname;
    // console.log("Router working")
    for (let {method, url, handler} of this.routes) {
      let match = url.exec(path);
      if (!match || request.method != method) continue;
      //returns response when a handler was found
      let urlParts = match.slice(1).map(decodeURIComponent);
      return handler(context, ...urlParts, request)
    }
    return null;
  }
};
