const {createServer} = require('http');
const Router = require("./router");
const ecstatic = require("ecstatic");

const router = new Router()
const defaultHeaders = {"Content-Type": "text/plain"};

class SkillShareServer {
  constructor(talks) {
    this.talks = talks;
    this.version = 0;
    this.waiting = [];

    //to serve static files from public directory
    let fileServer = ecstatic({root: "./public"});

    this.server = createServer((request, response) => {
      //'this' is the context for resolve, in this case the server
      let resolved = router.resolve(this, request);
      if (resolved) {
        resolved.catch(error =>{
          if (error.status != null) return error;
          return {body: String(error), status: 500};
        }).then(({body,
                  status = 200,
                  headers = defaultHeaders}) => {
                response.writeHead(status, headers);
                response.end(body);
              });
      } else {
        //if it wasn't a http request routed in router.js, then serve static fies in root directory
        fileServer(request, response);
      }
    });
  }
  start(port){
    this.server.listen(port)
  }
  stop() {
    this.server.close()
  }
}

//helper method that builds array of talks that will be sent to the client
SkillShareServer.prototype.talkResponse = function() {
  let talks = [];
  for (let title of Object.keys(this.talks)) {
    talks.push(this.talks[title]);
  }
  return {
    body: JSON.stringify(talks), // turn array into JSON
    //extra headers that inform sever to delay response if no new talks are present
    headers: {"Content-Type": "application/json",
              "ETag": `"${this.version}"`}
  };
};

SkillShareServer.prototype.waitForChanges = function(time){
  return new Promise(resolve => {
    this.waiting.push(resolve);
    setTimeout(() => {
      if (!this.waiting.includes(resolve)) return;
      this.waiting = this.waiting.filter(r => r != resolve);
      resolve({status: 304});
    }, time * 1000);
  });
}

SkillShareServer.prototype.updated = function() {
  this.version++;
  let response = this.talkResponse();
  this.waiting.forEach(resolve => resolve(response));
  this.waiting = [];
}

new SkillShareServer(Object.create(null)).start(8000);

const talkPath = /^\/talks\/([^\/]+)$/;

router.add("GET", talkPath, async (server, title) => {
  if (title in server.talks) {
    return {body: JSON.stringify(server.talks[title]),
            headers: {"Content-Type": "application/json"}};
  } else {
    return {status: 404, body: `No talk '${title}' found`};
  }
});

//Delet a talk
router.add("DELETE", talkPath, async (server, title) => {
  if (title in server.talks) {
    delete server.talks[title];
    //.updated method notifies waiting long polling requests about the change.
    server.updated();
  }
  return {status: 204};
});

//function to retrieve content of a request body --> reads all content from readable stream and returns
//promise that resolves to a string

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("error", reject);
    stream.on("data", chunk => data += chunk.toString());
    stream.on("end", () => resolve(data));
  })
}

router.add("PUT", talkPath,
            async (server, title, request) => {
              let requestBody = await readStream(request);
              let talk;
              try { talk = JSON.parse(requestBody);}
              catch (_) {return {status: 400, body: "Invalid JSON"}; }

              if (!talk ||
                  typeof talk.presenter != "string" ||
                  typeof talk.summary != "string") {
                return {status: 400, body: "Bad talk data"};
                  }
              server.talks[title] = {title,
                                    presenter: talk.presenter,
                                    summary: talk.summary,
                                    comments: []};
              //updated() notifies waiting long polling requests about changes
              server.updated();
              return {status: 204}
            });

//Adding a comment
router.add("POST", /^\/talks\/([^\/]+)\/comments$/,
            async (server, title, request) => {
      let requestBody = await readStream(request);
      let comment;
      try { comment = JSON.parse(requestBody); }
      catch (_) {return {status: 400, body: "Invalid JSON"}; }

      if (!comment ||
          typeof comment.author != "string" ||
          typeof comment.message != "string"){
            return {status: 400, body: "Bad comment data"};
          } else if (title in server.talks) {
            server.talks[title].comments.push(comment);
            server.updated();
            return {status: 204};
          } else {
            return {status: 404, body: `No talk '${title}' found`}
          }
  });

router.add("GET", /^\/talks$/, async (server, request) => {
  let tag = /"(.*)"/.exec(request.headers["if-none-match"]);
  let wait = /\bwait=(\d+)/.exec(request.headers["prefer"]);
  if (!tag || tag[1] != server.version) {
    return server.talkResponse();
  } else if (!wait) {
    return {status: 304};
  } else {
    return server.waitForChanges(Number(wait[1]));
  }
});
