function handleAction(state, action){
  if (action.type == "setUser") {
    localStorage.setItem("userName", action.user);
    return Object.assign({}, state, {user: action.user});
  } else if (action.type == "setTalks") {
    return Object.assign({}, state, {talks: action.talks})
  } else if (action.type == "newTalk") {
    fetchOK(talkURL(action.title), {
      method: "PUT",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        presenter: state.user,
        summary: action.summary
      })
    }).catch(reportError);
  } else if (action.type == "deleteTalk") {
    fetchOK(talkURL(action.talk), {method: "DELETE"})
      .catch(reportError);
  } else if (action.type == "newComment") {
    fetchOK(talkURL(action.talk) + "/comments", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        author: state.user,
        message: action.message
      })
    }).catch(reportError);
  }
  return state;
}

//wrapper function for fetch that returns an error when server returns an error
function fetchOK(url, options) {
  return fetch(url, options).then(response => {
    if (response.status < 400) return response;
    else throw new Error(response.statusText);
  });
}
//builds URL for talk
function talkURL(title) {
  return "talks/" + encodeURIComponent(title);
}

function reportError(error){
  alert(String(error));
}

//Rendering components

function renderUserField(name, dispatch) {
  return elt("label", {}, "Your name: ", elt("input", {
    type: "text",
    value: name,
    onchange(event) {
      dispatch({type: "setUser", user: event.target.value});
    }
  }));
}
//function to build DOM elements
function elt(type, props, ...children) {
  let dom = document.createElement(type);
  if (props) Object.assign(dom, props);
  for (let child of children) {
    if (typeof child != "string") dom.appendChild(child);
    else dom.appendChild(document.createTextNode(child));
  }
  return dom;
}

function renderTalk(talk, dispatch) {
  return elt(
    "section", {className: "talk"},
    elt("h2", null, talk.title, " ", elt("button", {
        type: "button",
        onclick(){
          dispatch({type: "deleteTalk", talk: talk.title});
        }
    }, "Delete")),
    elt("div", null, "by ",
        elt("strong", null, talk.presenter)),
    elt("p", null, talk.summary),
    ...talk.comments.map(renderComment),
    elt("form", {
      onsubmit(event) {
        event.preventDefault();
        let form = event.target;
        dispatch({type: "newComment",
                  talk: talk.title,
                  message: form.elements.comment.value});
        form.reset();
      }
    }, elt("input", {type: "text", name: "comment"}), " ",
        elt("button", {type: "submit"}, "Add comment")));
}

function renderComment(comment) {
  return elt("p", {className: "comment"},
            elt("strong", null, comment.author),
          ": ", comment.message);
}

function renderTalkFrom(dispatch) {
  let title = elt("input", {type: "text"});
  let summary = elt("input", {type: "text"});
  return elt("form", {
    onsubmit(event) {
      event.preventDefault();
      dispatch({type: "newTalk",
                title: title.value,
                summary: summary.value});
      event.target.reset();
    }
  }, elt("h3", null, "Submit a Talk"),
    elt("label", null, "Title: ", title),
    elt("label", null, "Summary: ", summary),
    elt("button", {type: "submit"}, "Submit"));
}

//function to that keeps polling the server for /talks and calls callback when new talk is available
async function pollTalks(update){
  let tag = undefined;
  for(;;) {
    let response;
    try {
      response = await fetchOK("talks", {
        //extra headers that inform sever to delay response if no new talks are present
        headers: tag && {"If-None-Match": tag,
                        "Prefer": "wait=90"}
      });
    } catch (e) {
      console.log("Request failed: " + e);
      //force async function to wait
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
    //304 menas it timed out, so function should start a new request
    if (response.status == 304) continue;
    //if 200 response, body is read as JSON and passed to the callback
    tag = response.headers.get("ETag");
    update(await response.json());
  }
}

//Tying user interface together

//When talks change ths component rerenders all of them
class SkillShareApp {
  constructor(state, dispatch){
    this.dispatch = dispatch;
    this.talkDOM = elt("div",{className: "talks"});
    this.dom = elt("div", null,
                    renderUserField(state.user, dispatch),
                    this.talkDOM,
                    renderTalkFrom(dispatch));
    this.setState(state);
  }

  setState(state){
    if (state.talks != this.talks) {
      this.talkDOM.textContent = "";
      for (let talk of state.talks) {
        this.talkDOM.appendChild(
          renderTalk(talk, this.dispatch));
      }
      this.talks = state.talks;
    }
  }
}

function runApp() {
  let user = localStorage.getItem("userName") || "Anon";
  let state, app;
  function dispatch(action) {
    state = handleAction(state, action);
    app.setState(state);
  }


pollTalks(talks => {
    if (!app) {
      state = {user, talks};
      app = new SkillShareApp(state, dispatch);
      document.body.appendChild(app.dom);
    } else {
      dispatch({type: "setTalks", talks});
    }
  }).catch(reportError);
}
console.log("running app")

runApp();
