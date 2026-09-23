import "./styles.css";
import React, { useState, useMemo, useEffect, useRef, useCallback, useReducer, useContext } from "react";
import { createRoot } from "react-dom/client";
import Editor from "@monaco-editor/react";
import * as Babel from "@babel/standalone";

class PreviewBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return <div className="preview-error"><span className="ico">⚠️</span><b>Runtime error</b><small>{this.state.error.message}</small><button type="button" className="preview-retry" onClick={() => this.setState({ error: null })}>↻ Retry Preview</button></div>;
    }
    return this.props.children;
  }
}

const DEMO_PROPS = { name: "Ada", score: 42, text: "Hello", label: "Demo", value: "Demo", title: "Demo", count: 3 };

function PreviewRuntime({ Comp }) {
  return <div className="preview-runtime">
    <Comp {...DEMO_PROPS} />
  </div>;
}

function formatPreviewArgs(args) {
  return args.map(value => {
    try {
      if (typeof value === "string") return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }).join(" ");
}

function compileLive(code, onLog = () => { }) {
  // The editor contains a complete JSX component. Compile it with Babel's
  // React preset (not only the low-level JSX transform), then evaluate it
  // against the React runtime used by ReactQuest. This is the same path for
  // cleared and uncleared missions, so a solved mission never gets a special
  // fake preview.
  const source = String(code || "").trim();
  if (!source) return { error: "Enter some React code first.", Comp: null };

  // Remove module-only imports/exports before evaluating inside new Function.
  // Keep this deliberately conservative so JSX such as <img ... /> is never
  // touched by the cleanup step.
  const stripped = source
    .replace(/^\s*import(?:[\s\S]*?from\s*)?["'][^"']+["']\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "")
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");

  const babel = Babel?.default || Babel;
  if (!babel || typeof babel.transform !== "function") {
    return { error: "React preview compiler is unavailable.", Comp: null };
  }

  let compiled;
  try {
    compiled = babel.transform(stripped, {
      filename: "challenge.jsx",
      sourceType: "script",
      parserOpts: { plugins: ["jsx"] },
      presets: [["react", { runtime: "classic", development: false }]],
    }).code;
  } catch (err) {
    return { error: String(err?.message || err).split("\n")[0], Comp: null };
  }

  // Find the component from the user's source first. This also handles
  // function App(), const App = () => ..., and named components.
  const sourceNames = [
    ...stripped.matchAll(/(?:function|const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g),
  ].map(m => m[1]);
  const compiledNames = [
    ...compiled.matchAll(/(?:function|const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g),
  ].map(m => m[1]);
  const names = [...new Set([...sourceNames, ...compiledNames])];
  const target = names.includes("App") ? "App" : names[0];

  if (!target) {
    // Some ReactQuest missions intentionally teach a code fragment rather than
    // a renderable component (reducers, callbacks, memoized calculations,
    // context declarations, etc.). Babel has already proven that the user's
    // code is syntactically valid, so these missions must NOT be treated as
    // compiler failures just because there is no App component to mount.
    return {
      error: null,
      Comp: null,
      fragment: true,
      fragmentMessage: "Valid React/JavaScript code — this mission teaches a code fragment, so there is no component to render."
    };
  }

  const previewConsole = {
    log: (...args) => onLog("log", formatPreviewArgs(args)),
    info: (...args) => onLog("info", formatPreviewArgs(args)),
    warn: (...args) => onLog("warn", formatPreviewArgs(args)),
    error: (...args) => onLog("error", formatPreviewArgs(args)),
  };
  // Small sandbox-only components keep missions that teach composition,
  // Suspense, props, or conditional UI renderable even when their child
  // components are intentionally omitted from the exercise starter.
  const PreviewStub = ({ children, label = "Component" }) =>
    React.createElement("div", { style: { padding: "8px", border: "1px dashed #33415d", borderRadius: "6px", margin: "3px 0" } }, children || label);
  const previewStubs = {
    Header: () => React.createElement(PreviewStub, { label: "Header" }),
    Main: () => React.createElement(PreviewStub, { label: "Main" }),
    Footer: () => React.createElement(PreviewStub, { label: "Footer" }),
    Settings: () => React.createElement(PreviewStub, { label: "Settings" }),
    Spinner: () => React.createElement(PreviewStub, { label: "Loading…" }),
    Content: () => React.createElement(PreviewStub, { label: "Content" }),
    List: ({ items = [] }) => React.createElement("ul", null, items.map((item, i) => React.createElement("li", { key: item?.id ?? i }, item?.name ?? String(item)))),
    Empty: () => React.createElement(PreviewStub, { label: "Empty" }),
    Error: () => React.createElement(PreviewStub, { label: "Error" }),
    Online: () => React.createElement(PreviewStub, { label: "Online" }),
    Offline: () => React.createElement(PreviewStub, { label: "Offline" }),
    Beta: () => React.createElement(PreviewStub, { label: "Beta" }),
    Badge: ({ name = "Badge", children }) => React.createElement(PreviewStub, { label: name }, children),
    Score: ({ score = 100 }) => React.createElement(PreviewStub, { label: `Score: ${score}` }),
    Button: ({ label = "Button", ...props }) => React.createElement("button", props, label),
    Editor: ({ onSave }) => React.createElement("button", { onClick: onSave }, "Editor"),
    Row: ({ item = {} }) => React.createElement("li", null, item.name ?? item.label ?? "Row"),
    ...{}
  };
  const scope = {
    React, console: previewConsole,
    useState, useEffect, useMemo, useRef, useCallback, useReducer, useContext,
    useLayoutEffect: React.useLayoutEffect,
    useInsertionEffect: React.useInsertionEffect,
    useId: React.useId,
    useImperativeHandle: React.useImperativeHandle,
    useDebugValue: React.useDebugValue,
    useDeferredValue: React.useDeferredValue,
    useTransition: React.useTransition,
    useSyncExternalStore: React.useSyncExternalStore,
    createContext: React.createContext,
    lazy: React.lazy,
    Suspense: React.Suspense,
    Fragment: React.Fragment,
    createElement: React.createElement,
    ...previewStubs,
  };
  const keys = Object.keys(scope);

  try {
    const fn = new Function(
      ...keys,
      compiled + `\n;return typeof ${target} !== "undefined" ? ${target} : null;`
    );
    const Comp = fn(...keys.map(k => scope[k]));
    if (typeof Comp !== "function") {
      return { error: `${target} is not a React component function.`, Comp: null };
    }
    return { error: null, Comp };
  } catch (err) {
    return { error: String(err?.message || err).split("\n")[0], Comp: null };
  }
}

function safeGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { }
}

const missions = [
  {
    id: 1, world: "FOUNDATIONS", title: "Hello, React!", concept: "Components", xp: 100, difficulty: 1, type: "build",
    lesson: "React UIs are made from components. A component is just a JavaScript function whose name starts with a capital letter and that returns JSX — a description of what should appear on screen.",
    why: "This is the mental model behind every React app: components return what should appear on screen.",
    example: `function Welcome() {\n  return <h2>Hello, Learner!</h2>;\n}`,
    starter: `function App() {\n  return <h1>???</h1>;\n}`,
    task: "Make App render the exact text: ReactQuest",
    answer: "ReactQuest",
    hint: "Return an <h1> whose text is ReactQuest.",
    hint2: "JSX text content goes directly between the opening and closing tags — no curly braces needed for plain text.",
    hint3: "Try: return <h1>ReactQuest</h1>;"
  },
  {
    id: 2, world: "FOUNDATIONS", title: "JSX Reactor", concept: "JSX", xp: 100, difficulty: 1, type: "build",
    lesson: "JSX lets you write HTML-like markup inside JavaScript. Anywhere you need a real JS value inside that markup — a variable, a calculation, a function call — you drop it inside curly braces { }.",
    why: "Curly-brace expressions are how dynamic data — usernames, prices, counts — actually reach the page.",
    example: `const title = "Dashboard";\nreturn <h2>{title}</h2>;`,
    starter: `function App() {\n  const hero = "Ada";\n  return <h1>???</h1>;\n}`,
    task: "Render the variable hero inside the h1.",
    answer: "{hero}",
    hint: "Put the JavaScript expression inside curly braces.",
    hint2: "Curly braces { } tell JSX 'evaluate this as JavaScript' instead of treating it as literal text.",
    hint3: "Try: return <h1>{hero}</h1>;"
  },
  {
    id: 3, world: "FOUNDATIONS", title: "Component Forge", concept: "Components", xp: 125, difficulty: 1, type: "build",
    lesson: "A component becomes reusable UI the moment you render its function name as a JSX tag, like <Badge />, instead of calling it like a normal function.",
    why: "Composing small components together is how large UIs stay manageable and readable.",
    example: `function Icon() { return <span>⭐</span>; }\nfunction App() { return <div><Icon /></div>; }`,
    starter: `function Badge() {\n  return <span>READY</span>;\n}\n\nfunction App() {\n  return (\n    <div>\n      {/* Render Badge here */}\n    </div>\n  );\n}`,
    task: "Render the Badge component inside App.",
    answer: "<Badge />",
    hint: "Custom components begin with a capital letter.",
    hint2: "To render a component, write its name like an HTML tag: <ComponentName />.",
    hint3: "Try placing <Badge /> where the comment is."
  },
  {
    id: 4, world: "PROPS", title: "Message Delivery", concept: "Props", xp: 125, difficulty: 1, type: "debug",
    lesson: "Props let a parent component pass information down to a child. Inside JSX, a prop is just a variable — so it still needs curly braces to be evaluated, the same as any other JS expression.",
    why: "Props are the main channel parent and child components use to communicate.",
    example: `function Label({ text }) { return <p>Value: {text}</p>; }`,
    starter: `function Greeting({ name }) {\n  return <h1>Hello, name!</h1>;\n}`,
    task: "Fix Greeting so it displays the name prop.",
    answer: "Hello, {name}!",
    hint: "The word name is currently plain text instead of a JSX expression.",
    hint2: "Wrap just the variable in curly braces so React evaluates it, rather than printing the literal word 'name'.",
    hint3: "Try: <h1>Hello, {name}!</h1>"
  },
  {
    id: 5, world: "PROPS", title: "Prop Tunnel", concept: "Props", xp: 125, difficulty: 2, type: "build",
    lesson: "When you don't destructure props in the function signature, all of them arrive bundled together in a single props object — so you reach individual values with dot notation, like props.score.",
    why: "Most real components receive several props at once, so reading from the props object is a core skill.",
    example: `function Item(props) { return <span>{props.name}</span>; }`,
    starter: `function Player(props) {\n  return <strong>???</strong>;\n}`,
    task: "Render props.score.",
    answer: "{props.score}",
    hint: "Access the score property from the props object.",
    hint2: "Since Player wasn't destructured, the value lives at props.score — wrap it in curly braces to render it.",
    hint3: "Try: <strong>{props.score}</strong>"
  },
  {
    id: 6, world: "EVENTS", title: "Button Protocol", concept: "Events", xp: 150, difficulty: 2, type: "debug",
    lesson: "React event handlers must be passed as function references, not called. Writing onClick={launch()} runs launch immediately while rendering; onClick={launch} hands React the function to call later, on click.",
    why: "This exact mistake — calling a handler instead of passing it — is one of the most common early React bugs.",
    example: `function ping() { console.log("ping"); }\n<button onClick={ping}>Ping</button>`,
    starter: `function App() {\n  function launch() {\n    console.log("LAUNCH");\n  }\n  return <button onClick={launch()}>Launch</button>;\n}`,
    task: "Fix the click handler so launch runs when the button is clicked.",
    answer: "onClick={launch}",
    hint: "Remove the parentheses. React needs the function reference.",
    hint2: "onClick={launch()} calls launch immediately during render — you want to hand React the function itself.",
    hint3: "Try: <button onClick={launch}>Launch</button>"
  },
  {
    id: 7, world: "STATE", title: "Counter Core", concept: "useState", xp: 175, difficulty: 2, type: "build",
    lesson: "useState gives a component memory: it returns the current value and a setter function. Calling the setter schedules a re-render with the new value — you never assign to the state variable directly.",
    why: "useState plus click handlers power almost every interactive UI element you've ever used.",
    example: `const [n, setN] = useState(0);\n<button onClick={() => setN(n + 1)}>{n}</button>`,
    starter: `import { useState } from "react";\n\nfunction App() {\n  const [count, setCount] = useState(0);\n  return <button>???</button>;\n}`,
    task: "Make the button show count and increment it by one when clicked.",
    answer: "onClick={() => setCount(count + 1)}",
    hint: "Use onClick with a function that calls setCount.",
    hint2: "Wrap the update in an arrow function so it only runs on click, not during render: onClick={() => setCount(count + 1)}.",
    hint3: "Try: <button onClick={() => setCount(count + 1)}>{count}</button>"
  },
  {
    id: 8, world: "STATE", title: "State Switch", concept: "useState", xp: 175, difficulty: 2, type: "debug",
    lesson: "Never mutate state directly with on = !on — plain assignment doesn't tell React anything changed, so nothing re-renders. Always call the setter returned by useState instead.",
    why: "Silently mutating state instead of using the setter is a classic bug that's hard to spot later.",
    example: `const [open, setOpen] = useState(false);\nfunction toggle() { setOpen(!open); }`,
    starter: `const [on, setOn] = useState(false);\n\nfunction toggle() {\n  on = !on;\n}`,
    task: "Fix toggle so it updates state.",
    answer: "setOn(!on)",
    hint: "The setter is setOn.",
    hint2: "Replace the direct assignment with a call to the setter: setOn(!on) instead of on = !on.",
    hint3: "Try: function toggle() { setOn(!on); }"
  },
  {
    id: 9, world: "STATE", title: "State Objects", concept: "State", xp: 175, difficulty: 3, type: "build",
    lesson: "When state holds an object, never edit a field on the old object. Spread the existing fields into a new object with { ...user }, then overwrite just the one field that changed.",
    why: "Nested state updates like this show up constantly in real apps — user profiles, settings, forms.",
    example: `const [car, setCar] = useState({ color: "red", speed: 10 });\nsetCar({ ...car, speed: car.speed + 5 });`,
    starter: `const [user, setUser] = useState({ name: "Mina", level: 4 });\n\nfunction levelUp() {\n  // update level\n}`,
    task: "Increase user.level by one without mutating user.",
    answer: "setUser({ ...user, level: user.level + 1 })",
    hint: "Spread the old object, then overwrite level.",
    hint2: "{ ...user } copies every existing field; add level: user.level + 1 right after it to overwrite just that one.",
    hint3: "Try: setUser({ ...user, level: user.level + 1 });"
  },
  {
    id: 10, world: "STATE", title: "State Arrays", concept: "State", xp: 200, difficulty: 3, type: "build",
    lesson: "Array state works the same way as object state: build a brand new array (often with spread, map, or filter) rather than pushing onto the existing one.",
    why: "Adding to a list without mutating the original array is what keeps React's change-detection reliable.",
    example: `const [tags, setTags] = useState(["new"]);\nsetTags([...tags, "sale"]);`,
    starter: `const [items, setItems] = useState(["⚡"]);\n\nfunction addItem() {\n  // add "🔥"\n}`,
    task: "Add 🔥 to the array.",
    answer: 'setItems([...items, "🔥"])',
    hint: "Create a new array containing the old items plus the new value.",
    hint2: "Spread the old array with ...items inside a new array literal, then add the new value after it.",
    hint3: 'Try: setItems([...items, "🔥"]);'
  },
  {
    id: 11, world: "RENDERING", title: "Conditional Gate", concept: "Conditional Rendering", xp: 175, difficulty: 2, type: "build",
    lesson: "React lets you choose what to render with plain JavaScript. The pattern {condition && <Something/>} renders Something only when condition is truthy — otherwise React renders nothing at all.",
    why: "Conditionally showing UI — badges, alerts, locked content — is everywhere in real apps.",
    example: `const hasNew = true;\n<span>{hasNew && "NEW"}</span>`,
    starter: `function App() {\n  const unlocked = true;\n  return <div>???</div>;\n}`,
    task: "Show 'UNLOCKED' when unlocked is true.",
    answer: "{unlocked && 'UNLOCKED'}",
    hint: "The && pattern renders the right side only when the left side is truthy.",
    hint2: "{condition && value} shows value only if condition is true; if it's false, React shows nothing.",
    hint3: "Try: <div>{unlocked && 'UNLOCKED'}</div>"
  },
  {
    id: 12, world: "RENDERING", title: "Ternary Terminal", concept: "Conditional Rendering", xp: 175, difficulty: 2, type: "build",
    lesson: "Use a ternary, condition ? trueValue : falseValue, when you need one thing OR another — unlike &&, a ternary always renders exactly one of two options.",
    why: "Ternaries are the standard way to toggle between two UI states, like online/offline.",
    example: `const loggedIn = false;\n<p>{loggedIn ? "Welcome back" : "Please log in"}</p>`,
    starter: `const online = false;\n\nfunction App() {\n  return <h2>???</h2>;\n}`,
    task: "Render 'ONLINE' or 'OFFLINE' based on online.",
    answer: "{online ? 'ONLINE' : 'OFFLINE'}",
    hint: "Ternary syntax is condition ? trueValue : falseValue.",
    hint2: "Unlike &&, a ternary always renders one side or the other — good for either/or states.",
    hint3: "Try: <h2>{online ? 'ONLINE' : 'OFFLINE'}</h2>"
  },
  {
    id: 13, world: "LISTS", title: "List Scanner", concept: "Lists", xp: 200, difficulty: 3, type: "build",
    lesson: "map() transforms an array of data into an array of JSX elements — one per item. The whole map() call goes inside curly braces, nested inside the parent element that should contain the list.",
    why: "Turning raw data into a list of UI elements is one of React's most common patterns.",
    example: `const colors = ["red","blue"];\n<ul>{colors.map(c => <li key={c}>{c}</li>)}</ul>`,
    starter: `const skills = ["JSX", "Props", "State"];\n\nfunction App() {\n  return <ul>???</ul>;\n}`,
    task: "Render every skill as an li.",
    answer: "{skills.map(skill => <li key={skill}>{skill}</li>)}",
    hint: "Use map and give each element a stable key.",
    hint2: ".map() returns an array of <li> elements; wrap the whole call in { } inside your <ul>.",
    hint3: "Try: <ul>{skills.map(skill => <li key={skill}>{skill}</li>)}</ul>"
  },
  {
    id: 14, world: "LISTS", title: "Key Fixer", concept: "Keys", xp: 200, difficulty: 3, type: "debug",
    lesson: "Keys help React tell list items apart between renders, so it can update, reorder, or remove exactly the right elements. Keys should be unique and stable — a database id is ideal; a display name that could repeat or change is not.",
    why: "Wrong keys cause subtle bugs — list items swapping places or inputs losing focus unexpectedly.",
    example: `items.map(item => <li key={item.id}>{item.label}</li>)`,
    starter: `const quests = [{id:1,name:"JSX"}, {id:2,name:"State"}];\n\nfunction App() {\n  return quests.map(q => <div key={q.name}>{q.name}</div>);\n}`,
    task: "This is valid, but change the key to use the item's id.",
    answer: "key={q.id}",
    hint: "The object already has a stable id property.",
    hint2: "Swap key={q.name} for key={q.id} — id is guaranteed unique, name might not be.",
    hint3: "Try: key={q.id} instead of key={q.name}"
  },
  {
    id: 15, world: "FORMS", title: "Input Link", concept: "Forms", xp: 225, difficulty: 3, type: "build",
    lesson: "A controlled input gets its displayed value from React state (value={name}) and reports changes back through onChange, which reads the new text from e.target.value. Both pieces are required together.",
    why: "Controlled inputs are the backbone of nearly every React form.",
    example: `const [q, setQ] = useState("");\n<input value={q} onChange={e => setQ(e.target.value)} />`,
    starter: `const [name, setName] = useState("");\n\nreturn <input ??? />;`,
    task: "Connect the input to name and update name as the user types.",
    answer: 'value={name} onChange={e => setName(e.target.value)}',
    hint: "You need value plus an onChange handler.",
    hint2: "value={name} makes the input show state; onChange={e => setName(e.target.value)} updates state as you type.",
    hint3: "Try: <input value={name} onChange={e => setName(e.target.value)} />"
  },
  {
    id: 16, world: "FORMS", title: "Form Firewall", concept: "Forms", xp: 225, difficulty: 3, type: "debug",
    lesson: "By default, submitting a form reloads the whole page — almost never what you want in a React app. Calling e.preventDefault() as the first line of your submit handler stops that default browser behavior.",
    why: "Without this, every form submit would reload the page and wipe out your component's state.",
    example: `function onSubmit(e) { e.preventDefault(); console.log("saved"); }`,
    starter: `function handleSubmit(e) {\n  // stop page reload\n  console.log("submitted");\n}`,
    task: "Prevent the default submit behavior.",
    answer: "e.preventDefault()",
    hint: "The event object has a preventDefault method.",
    hint2: "Call e.preventDefault() as the very first line inside handleSubmit, before anything else runs.",
    hint3: "Try adding: e.preventDefault();"
  },
  {
    id: 17, world: "EFFECTS", title: "Effect Reactor", concept: "useEffect", xp: 250, difficulty: 4, type: "build",
    lesson: "useEffect synchronizes a component with something outside React, after it renders. It takes a callback function plus a dependency array; an empty array [] means 'run this once, right after the first render.'",
    why: "useEffect is how components talk to the outside world — APIs, timers, subscriptions.",
    example: `useEffect(() => { console.log("mounted"); }, []);`,
    starter: `import { useEffect } from "react";\n\nfunction App() {\n  useEffect(???);\n  return <p>Ready</p>;\n}`,
    task: "Log 'booted' after the first render only.",
    answer: "() => { console.log('booted') }, []",
    hint: "useEffect receives a callback and a dependency array.",
    hint2: "An empty dependency array [] tells React to run the effect only once, after the first render.",
    hint3: "Try: useEffect(() => { console.log('booted') }, []);"
  },
  {
    id: 18, world: "EFFECTS", title: "Cleanup Crew", concept: "useEffect", xp: 250, difficulty: 4, type: "debug",
    lesson: "An effect can return a cleanup function. React runs it right before the effect re-runs or the component unmounts — the natural place to cancel timers, subscriptions, or listeners you started.",
    why: "Skipping cleanup is a common cause of memory leaks and duplicate timers in real apps.",
    example: `useEffect(() => {\n  const t = setTimeout(fn, 1000);\n  return () => clearTimeout(t);\n}, []);`,
    starter: `useEffect(() => {\n  const id = setInterval(tick, 1000);\n  // ???\n}, []);`,
    task: "Return a cleanup function that clears the interval.",
    answer: "return () => clearInterval(id)",
    hint: "The effect callback can return a function.",
    hint2: "Whatever function you return from the effect callback runs automatically as cleanup.",
    hint3: "Try adding: return () => clearInterval(id);"
  },
  {
    id: 19, world: "HOOKS", title: "Custom Hook Lab", concept: "Custom Hooks", xp: 275, difficulty: 4, type: "build",
    lesson: "A custom hook is just a normal JavaScript function whose name happens to start with 'use'. It can call other hooks and return whatever value the components using it need.",
    why: "Custom hooks let you reuse stateful logic across many components without copy-pasting it.",
    example: `function useShout(text) { return text.toUpperCase(); }`,
    starter: `function useDouble(value) {\n  // return twice the value\n}`,
    task: "Return value * 2.",
    answer: "return value * 2",
    hint: "A custom hook is still just a JavaScript function.",
    hint2: "Nothing happens automatically — write an explicit return statement with the computed value.",
    hint3: "Try: return value * 2;"
  },
  {
    id: 20, world: "CONTEXT", title: "Context Beacon", concept: "Context", xp: 300, difficulty: 4, type: "build",
    lesson: "Context lets deeply nested components read a shared value without every component in between having to pass it down as a prop. Anything placed between <Provider> and </Provider> becomes its children and can read that value.",
    why: "Context avoids 'prop drilling' — threading a prop through layers that don't actually need it.",
    example: `<AuthContext.Provider value={user}><Dashboard /></AuthContext.Provider>`,
    starter: `const ThemeContext = createContext("dark");\n\nfunction App() {\n  return <ThemeContext.Provider value="light">???</ThemeContext.Provider>;\n}`,
    task: "Render a span containing the word light inside the provider.",
    answer: "<span>light</span>",
    hint: "The provider can wrap any JSX children.",
    hint2: "Put the JSX you want rendered between the opening and closing Provider tags, just like any other element's children.",
    hint3: "Try: <ThemeContext.Provider value=\"light\"><span>light</span></ThemeContext.Provider>"
  },
  {
    id: 21, world: "REDUCER", title: "Reducer Forge", concept: "useReducer", xp: 325, difficulty: 5, type: "build",
    lesson: "useReducer centralizes state transitions in one function: given the current state and an action describing what happened, the reducer returns the next state. It's just an if/switch that compares action.type.",
    why: "useReducer scales better than useState once you have many related state transitions to manage.",
    example: `function reducer(state, action) {\n  if (action.type === "reset") return 0;\n  return state;\n}`,
    starter: `function reducer(state, action) {\n  // if action.type is "inc", return state + 1\n}`,
    task: "Implement the increment case.",
    answer: "if (action.type === 'inc') return state + 1",
    hint: "Compare action.type and return the next state.",
    hint2: "Check action.type with === against the string 'inc', then return state + 1 in that case.",
    hint3: "Try: if (action.type === 'inc') return state + 1;"
  },
  {
    id: 22, world: "PERFORMANCE", title: "Memo Shield", concept: "Memoization", xp: 350, difficulty: 5, type: "build",
    lesson: "useMemo caches the result of an expensive calculation and only recomputes it when something in the dependency array actually changes, skipping the work on every other render.",
    why: "Memoization keeps apps fast by avoiding unnecessary recalculation on every render.",
    example: `const total = useMemo(() => price * qty, [price, qty]);`,
    starter: `const result = useMemo(() => {\n  // expensive calculation\n}, [items]);`,
    task: "Return items.length from the memoized calculation.",
    answer: "return items.length",
    hint: "The callback passed to useMemo should return the computed value.",
    hint2: "useMemo's first argument is a callback — give it an explicit return statement with the value to cache.",
    hint3: "Try: return items.length;"
  },
  {
    id: 23, world: "FOUNDATIONS", title: "Fragment Bridge", concept: "Fragments", xp: 125, difficulty: 1, type: "build", lesson: "Fragments let a component return multiple sibling elements without adding an unnecessary wrapper to the DOM.", why: "Fragments keep markup clean when a component needs to return siblings.", example: `<>
  <h2>Title</h2>
  <p>Body</p>
</>`, starter: `function App() {
  return ???
}`, task: "Return two sibling elements with a Fragment.", answer: `<>
  <h2>Title</h2>
  <p>Body</p>
</>`, hint: "Use the short Fragment syntax.", hint2: "A Fragment starts with <> and closes with </>.", hint3: "Try wrapping the two elements in <>...</>."
  },
  {
    id: 24, world: "EVENTS", title: "Save Signal", concept: "Events", xp: 150, difficulty: 1, type: "debug", lesson: "Event handlers should receive a function reference so React can call it at the right time.", why: "Passing a function instead of calling it prevents accidental work during render.", example: "<button onClick={onSave}>Save</button>", starter: `function App() {
  function onSave() { console.log("saved"); }
  return <button onClick={onSave()}>Save</button>;
}`, task: "Fix the button so onSave runs only after a click.", answer: "onClick={onSave}", hint: "Remove the parentheses from the handler.", hint2: "React needs the function itself, not the result of calling it.", hint3: "Use <button onClick={onSave}>Save</button>."
  },
  {
    id: 25, world: "PROPS", title: "Default Ready", concept: "Props", xp: 150, difficulty: 1, type: "build", lesson: "Default parameters give a component a fallback when a prop is missing.", why: "Defaults make reusable components safer when callers omit optional values.", example: "function Badge({ label = \"READY\" }) { return <span>{label}</span>; }", starter: `function Badge({ label }) {
  return <span>{label}</span>;
}`, task: "Give label the default value READY.", answer: "label = \"READY\"", hint: "Use a default parameter while destructuring the prop.", hint2: "The fallback belongs inside the function parameter list.", hint3: "Try function Badge({ label = \"READY\" }) { ... }."
  },
  {
    id: 26, world: "EVENTS", title: "Input Echo", concept: "Events", xp: 150, difficulty: 1, type: "build", lesson: "Input events expose the latest text through e.target.value.", why: "Reading the event target is the bridge from browser input to React state.", example: "onChange={e => setText(e.target.value)}", starter: `function App() {
  const [text,setText] = useState("");
  return <input onChange={e => setText(???)}/>;
}`, task: "Store the input value in state.", answer: "e.target.value", hint: "The current input element is e.target.", hint2: "Its current text is in the value property.", hint3: "Use e.target.value as the setter argument."
  },
  {
    id: 27, world: "EVENTS", title: "Enter Key", concept: "Keyboard Events", xp: 150, difficulty: 1, type: "debug", lesson: "Keyboard handlers can inspect e.key to react to a specific key.", why: "Keyboard shortcuts and submit-on-Enter interactions rely on event properties.", example: "if (e.key === \"Enter\") submit();", starter: `function handleKey(e) {
  // submit on Enter
}`, task: "Trigger submit when Enter is pressed.", answer: "e.key === \"Enter\"", hint: "Check the key name on the keyboard event.", hint2: "The Enter key is represented by the string \"Enter\".", hint3: "Use an if condition around submit()."
  },
  {
    id: 28, world: "EVENTS", title: "Bubble Shield", concept: "Event Propagation", xp: 150, difficulty: 1, type: "debug", lesson: "Events bubble from a child toward its ancestors unless propagation is stopped.", why: "Stopping propagation is useful for nested clickable controls.", example: "function onIconClick(e) { e.stopPropagation(); }", starter: `function onIconClick(e) {
  // prevent parent click
}`, task: "Stop the click from bubbling to the parent.", answer: "e.stopPropagation()", hint: "The event object controls propagation.", hint2: "Call stopPropagation before other click work if needed.", hint3: "Add e.stopPropagation();"
  },
  {
    id: 29, world: "RENDERING", title: "Null Sentinel", concept: "Conditional Rendering", xp: 175, difficulty: 2, type: "debug", lesson: "Returning null tells React to render nothing for a component.", why: "A component can intentionally disappear without returning an empty wrapper.", example: "function EmptyState() { return null; }", starter: `function EmptyState() {
  return <div>Remove me</div>;
}`, task: "Render nothing from EmptyState.", answer: "return null", hint: "React treats null as no UI.", hint2: "Replace the JSX return with null.", hint3: "Use return null;"
  },
  {
    id: 30, world: "RENDERING", title: "Login Gate", concept: "Conditional Rendering", xp: 175, difficulty: 2, type: "build", lesson: "Conditions can switch between complete pieces of JSX.", why: "Authentication gates commonly show different UI depending on whether a user is signed in.", example: "return loggedIn ? <p>Welcome</p> : <p>Log in</p>;", starter: `function App() {
  const loggedIn = false;
  return ???;
}`, task: "Show Log in when the user is not logged in.", answer: "<p>Log in</p>", hint: "Use a ternary with loggedIn.", hint2: "The false branch should contain the Log in paragraph.", hint3: "Try loggedIn ? <p>Welcome</p> : <p>Log in</p>."
  },
  {
    id: 31, world: "LISTS", title: "Filtered Quests", concept: "Lists", xp: 200, difficulty: 2, type: "build", lesson: "filter() can select the data you want, then map() can turn those results into JSX.", why: "Filtering before mapping keeps rendering logic close to the data rule.", example: "quests.filter(q => q.done).map(q => <li key={q.id}>{q.name}</li>)", starter: `const quests = [{id:1,name:"JSX",done:true}];
function App(){ return <ul>???</ul>; }`, task: "Render only completed quests with stable keys.", answer: "quests.filter(q => q.done).map(q => <li key={q.id}>{q.name}</li>)", hint: "Filter first, then map.", hint2: "Keep the id as the key.", hint3: "Place the complete expression inside the ul."
  },
  {
    id: 32, world: "LISTS", title: "Stable Key", concept: "Keys", xp: 200, difficulty: 2, type: "debug", lesson: "Keys should come from stable item identity rather than array position.", why: "Stable keys help React preserve the correct component instance as lists change.", example: "key={task.id}", starter: `const tasks=[{id:1,label:"Fix"}];
function App(){ return tasks.map((task,index)=><p key={index}>{task.label}</p>); }`, task: "Replace the index key with the task id.", answer: "key={task.id}", hint: "Use the data identity already present on each task.", hint2: "Do not use index here.", hint3: "Change key={index} to key={task.id}."
  },
  { id: 33, world: "FORMS", title: "Note Controller", concept: "Forms", xp: 225, difficulty: 2, type: "build", lesson: "A controlled textarea follows the same value/onChange pattern as an input.", why: "Controlled form fields keep the displayed value synchronized with React state.", example: "value={note} onChange={e => setNote(e.target.value)}", starter: "function App(){ const [note,setNote]=useState(\"\"); return <textarea ??? />; }", task: "Control the textarea with note state.", answer: "value={note} onChange={e => setNote(e.target.value)}", hint: "Bind the current state as value.", hint2: "Update it from e.target.value.", hint3: "Use both props together." },
  { id: 34, world: "FORMS", title: "Checkbox Link", concept: "Forms", xp: 225, difficulty: 2, type: "build", lesson: "Checkboxes expose their boolean state through checked and e.target.checked.", why: "Boolean form controls need checked rather than value for controlled state.", example: "checked={done} onChange={e => setDone(e.target.checked)}", starter: "function App(){ const [done,setDone]=useState(false); return <input type=\"checkbox\" ??? />; }", task: "Control the checkbox with done state.", answer: "checked={done} onChange={e => setDone(e.target.checked)}", hint: "Use checked for a checkbox.", hint2: "Read the boolean from e.target.checked.", hint3: "Add both controlled props." },
  { id: 35, world: "EFFECTS", title: "Search Sync", concept: "useEffect", xp: 250, difficulty: 2, type: "build", lesson: "An effect should rerun when the external value it synchronizes with changes.", why: "Dependency arrays tell React exactly which values should trigger synchronization.", example: "useEffect(() => { document.title = query; }, [query]);", starter: "function App(){ const [query,setQuery]=useState(\"\"); useEffect(()=>{ document.title=query; }, ???); return null; }", task: "Make the effect rerun whenever query changes.", answer: "[query]", hint: "The dependency array belongs after the effect callback.", hint2: "Include query because the effect reads it.", hint3: "Use [query]." },
  { id: 36, world: "EFFECTS", title: "Timer Cleanup", concept: "Effects", xp: 250, difficulty: 2, type: "debug", lesson: "Timers started inside an effect should be cleared when the effect is cleaned up.", why: "Cleanup prevents intervals from continuing after a component unmounts.", example: "return () => clearInterval(id)", starter: "useEffect(()=>{ const id=setInterval(tick,1000); /* ??? */ },[]);", task: "Clear the interval during cleanup.", answer: "return () => clearInterval(id)", hint: "Return a cleanup function from the effect.", hint2: "The same id created by setInterval must be cleared.", hint3: "Add return () => clearInterval(id);" },
  { id: 37, world: "HOOKS", title: "Focus Lens", concept: "useRef", xp: 275, difficulty: 3, type: "build", lesson: "useRef can hold a DOM node without causing a render when the reference changes.", why: "Refs are the standard tool for focusing or measuring an element imperatively.", example: "<input ref={inputRef} />", starter: "function App(){ const inputRef=useRef(null); return <input ??? />; }", task: "Attach inputRef to the input.", answer: "ref={inputRef}", hint: "Pass the ref object to the JSX ref prop.", hint2: "React will populate inputRef.current after mount.", hint3: "Use ref={inputRef}." },
  { id: 38, world: "HOOKS", title: "Callback Relay", concept: "useCallback", xp: 275, difficulty: 3, type: "build", lesson: "useCallback memoizes a function reference until one of its dependencies changes.", why: "Stable callback references can reduce unnecessary child renders.", example: "const save = useCallback(() => { console.log(\"saved\"); }, []);", starter: "function App(){ const save = useCallback(()=>{ console.log(\"saved\"); }, ???); return <button onClick={save}>Save</button>; }", task: "Memoize save with no dependencies.", answer: "useCallback(() => { console.log(\"saved\"); }, [])", hint: "Keep the callback body and use an empty dependency list.", hint2: "The validator looks for useCallback and the saved log.", hint3: "Use [] when the callback reads no reactive values." },
  { id: 39, world: "HOOKS", title: "Hook Order", concept: "Rules of Hooks", xp: 275, difficulty: 3, type: "debug", lesson: "Hooks must be called at the top level of a component, before conditional branches.", why: "Consistent hook order lets React match state to the correct hook call across renders.", example: "const [count, setCount] = useState(0);", starter: "function App({open}){ if(open){ const [count,setCount]=useState(0); } return <p>Ready</p>; }", task: "Move useState out of the conditional.", answer: "const [count, setCount] = useState(0)", hint: "Hooks belong at the top level.", hint2: "Do not put useState inside if statements.", hint3: "Declare the state before the conditional." },
  {
    id: 40, world: "CONTEXT", title: "Theme Reader", concept: "Context", xp: 300, difficulty: 3, type: "build", lesson: "useContext reads the nearest matching context value without manually passing props through every layer.", why: "It removes prop drilling for values shared across a component tree.", example: "const theme = useContext(ThemeContext);", starter: `const ThemeContext=createContext("dark");
function App(){ const theme = ???; return <p>{theme}</p>; }`, task: "Read ThemeContext inside App.", answer: "useContext(ThemeContext)", hint: "Pass the context object to useContext.", hint2: "React returns the nearest provider value.", hint3: "Use const theme = useContext(ThemeContext);"
  },
  {
    id: 41, world: "CONTEXT", title: "Theme Provider", concept: "Context", xp: 300, difficulty: 3, type: "build", lesson: "A Provider supplies a value to all descendants that consume its context.", why: "Providers define where a shared context value becomes available.", example: "<ThemeContext.Provider value=\"neon\">", starter: `const ThemeContext=createContext("dark");
function App(){ return <ThemeContext.Provider ???><p>UI</p></ThemeContext.Provider>; }`, task: "Provide the neon theme value.", answer: "value=\"neon\"", hint: "Providers take their shared data through value.", hint2: "Put the string neon in the value prop.", hint3: "Use value=\"neon\"."
  },
  { id: 42, world: "CONTEXT", title: "Language Context", concept: "Context", xp: 300, difficulty: 3, type: "build", lesson: "createContext establishes a default value used when no Provider is above the component.", why: "The default keeps consumers usable even outside a provider.", example: "createContext(\"en\")", starter: "function App(){ const LanguageContext = ???; return null; }", task: "Create a language context with en as the default.", answer: "createContext(\"en\")", hint: "Call createContext with the fallback value.", hint2: "The default can be any JavaScript value.", hint3: "Use createContext(\"en\")." },
  { id: 43, world: "REDUCER", title: "Payload Pass", concept: "useReducer", xp: 325, difficulty: 4, type: "build", lesson: "Actions can carry data in a payload property when a reducer needs more than a simple event name.", why: "Payloads let one reducer handle flexible data-driven updates.", example: "action.payload", starter: "function reducer(state, action){ if(action.type === \"add\") return state + ???; return state; }", task: "Use the action payload in the addition.", answer: "action.payload", hint: "Read payload from the action object.", hint2: "The reducer receives both state and action.", hint3: "Use state + action.payload." },
  { id: 44, world: "REDUCER", title: "Reset Protocol", concept: "useReducer", xp: 325, difficulty: 4, type: "debug", lesson: "A reducer can have a reset action that returns the initial state directly.", why: "Explicit reset transitions make state machines predictable.", example: "action.type === \"reset\"", starter: "function reducer(state, action){ if(???) return 0; return state; }", task: "Return zero when the action type is reset.", answer: "action.type === \"reset\"", hint: "Compare the action type string.", hint2: "The reset branch should return 0.", hint3: "Use if (action.type === \"reset\") return 0;" },
  { id: 45, world: "REDUCER", title: "Increment Case", concept: "useReducer", xp: 325, difficulty: 4, type: "build", lesson: "Switch statements are a clear way to organize multiple reducer transitions.", why: "Each action type can map to one predictable state transition.", example: "case \"inc\": return state + 1", starter: "function reducer(state, action){ switch(action.type){ ??? } }", task: "Add the increment case.", answer: "case \"inc\": return state + 1", hint: "Put the case inside the switch.", hint2: "Return the next state for the inc action.", hint3: "Add case \"inc\": return state + 1." },
  { id: 46, world: "PERFORMANCE", title: "Cart Math", concept: "Memoization", xp: 350, difficulty: 4, type: "build", lesson: "Memoized calculations should include every reactive value they read.", why: "Correct dependencies keep derived values accurate without unnecessary recalculation.", example: "price * qty", starter: "function App(){ const price=5, qty=3; const total=useMemo(()=>{ return ???; },[price,qty]); return <p>{total}</p>; }", task: "Calculate the cart total.", answer: "price * qty", hint: "Multiply the two inputs.", hint2: "The memo callback should return the product.", hint3: "Use return price * qty;" },
  {
    id: 47, world: "PERFORMANCE", title: "Memo Component", concept: "React.memo", xp: 350, difficulty: 4, type: "build", lesson: "React.memo skips a child render when its props have not changed.", why: "Memoized components can avoid repeated rendering when parents update for unrelated reasons.", example: "React.memo", starter: `function Card(){ return <div>Card</div>; }
const MemoCard = ???(Card);`, task: "Wrap Card with React.memo.", answer: "React.memo", hint: "React.memo receives the component as its argument.", hint2: "Assign the memoized component to MemoCard.", hint3: "Use const MemoCard = React.memo(Card);"
  },
  { id: 48, world: "PERFORMANCE", title: "Memo Dependencies", concept: "useMemo", xp: 350, difficulty: 4, type: "build", lesson: "A dependency array should include the reactive values read by a memoized calculation.", why: "Accurate dependencies keep cached calculations correct.", example: "[price, qty]", starter: "function App(){ const price=5, qty=2; const total=useMemo(()=>price*qty, ???); return <p>{total}</p>; }", task: "Add price and qty to the dependency array.", answer: "[price, qty]", hint: "Both values are read inside the callback.", hint2: "List them in the array passed to useMemo.", hint3: "Use [price, qty]." },
  { id: 49, world: "ARCHITECTURE", title: "Component Contract", concept: "Component Design", xp: 400, difficulty: 5, type: "build", lesson: "Define a component with a clear prop contract.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "function Card({ title }) { return <h3>{title}</h3>; }", starter: "function Card({ title }) { return <h3>???</h3>; }", task: "Render the title prop.", answer: "{title}", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 50, world: "ARCHITECTURE", title: "Slot Builder", concept: "Composition", xp: 400, difficulty: 5, type: "build", lesson: "Use children to make a component accept nested JSX.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "function Panel({ children }) { return <section>{children}</section>; }", starter: "function Panel({ children }) { return <section>???</section>; }", task: "Render the children prop.", answer: "{children}", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 51, world: "ARCHITECTURE", title: "Boolean Prop", concept: "Props", xp: 450, difficulty: 6, type: "debug", lesson: "Pass a boolean prop with JSX shorthand.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<Button disabled />", starter: "function App(){ return <button ???>Locked</button>; }", task: "Disable the button with a boolean prop.", answer: "disabled", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 52, world: "ARCHITECTURE", title: "Variant Prop", concept: "Props", xp: 450, difficulty: 6, type: "build", lesson: "Choose a visual variant through a prop.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<Badge variant=\"success\" />", starter: "function App(){ return <Badge ??? />; }", task: "Pass the success variant.", answer: "variant=\"success\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 53, world: "ARCHITECTURE", title: "Data Adapter", concept: "Components", xp: 450, difficulty: 6, type: "build", lesson: "Transform raw data into props before rendering a child.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<UserCard name={user.name} />", starter: "function App(){ const user={name:\"Mina\"}; return <UserCard ??? />; }", task: "Pass the user name into UserCard.", answer: "name={user.name}", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 54, world: "ARCHITECTURE", title: "Composition Chain", concept: "Composition", xp: 450, difficulty: 6, type: "debug", lesson: "Compose small components instead of one giant render function.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<Header /><Main /><Footer />", starter: "function App(){ return <div>???</div>; }", task: "Render Header, Main, and Footer together.", answer: "<Header /><Main /><Footer />", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 55, world: "ARCHITECTURE", title: "Reducer Hook", concept: "useReducer", xp: 450, difficulty: 6, type: "build", lesson: "Initialize a reducer with a starting state.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "useReducer(reducer, 0)", starter: "function App(){ const [count,dispatch] = ???; return <p>{count}</p>; }", task: "Initialize the reducer with zero.", answer: "useReducer(reducer, 0)", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 56, world: "ARCHITECTURE", title: "Dispatch Signal", concept: "useReducer", xp: 450, difficulty: 6, type: "build", lesson: "Dispatch an action object to request a state transition.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "dispatch({ type: \"inc\" })", starter: "function App(){ const [count,dispatch]=useReducer((s,a)=>s+1,0); return <button onClick={???}>+</button>; }", task: "Dispatch the increment action on click.", answer: "() => dispatch({ type: \"inc\" })", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 57, world: "ARCHITECTURE", title: "Reducer Default", concept: "useReducer", xp: 450, difficulty: 6, type: "debug", lesson: "Return the existing state for unknown actions.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "return state", starter: "function reducer(state, action){ switch(action.type){ default: ??? } }", task: "Keep state unchanged for unknown actions.", answer: "return state", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 58, world: "ARCHITECTURE", title: "Reducer Payload", concept: "useReducer", xp: 450, difficulty: 6, type: "build", lesson: "Use a payload to set a numeric value.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "action.payload", starter: "function reducer(state, action){ if(action.type===\"set\") return ???; return state; }", task: "Return the payload for a set action.", answer: "action.payload", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 59, world: "TESTING", title: "Role Query", concept: "Testing", xp: 450, difficulty: 6, type: "build", lesson: "Select a button by its accessible role in a UI test.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "getByRole(\"button\")", starter: "const button = screen.???(\"button\");", task: "Find the button by role.", answer: "getByRole(\"button\")", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 60, world: "TESTING", title: "Text Query", concept: "Testing", xp: 450, difficulty: 6, type: "debug", lesson: "Select visible text in a UI test.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "getByText(\"Save\")", starter: "const save = screen.???(\"Save\");", task: "Find the Save text.", answer: "getByText(\"Save\")", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  {
    id: 61, world: "TESTING", title: "Click Event", concept: "Testing", xp: 500, difficulty: 7, type: "build", lesson: "Trigger a click in a component test.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "fireEvent.click(button)", starter: `const button = screen.getByRole("button");
???;`, task: "Click the button.", answer: "fireEvent.click(button)", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task."
  },
  { id: 62, world: "TESTING", title: "Async Assertion", concept: "Testing", xp: 500, difficulty: 7, type: "build", lesson: "Wait for UI that appears after an async update.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "findByText(\"Loaded\")", starter: "const item = await screen.???(\"Loaded\");", task: "Wait for Loaded text.", answer: "findByText(\"Loaded\")", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  {
    id: 63, world: "TESTING", title: "Test Intent", concept: "Testing", xp: 500, difficulty: 7, type: "debug", lesson: "Write a readable test description.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "it(\"renders the title\", () => {", starter: `???
  render(<App />);
});`, task: "Start the test with a clear description.", answer: "it(\"renders the title\", () => {", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task."
  },
  { id: 64, world: "TESTING", title: "Mock Function", concept: "Testing", xp: 500, difficulty: 7, type: "build", lesson: "Create a mock callback for a component test.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "vi.fn()", starter: "const onSave = ???;", task: "Create a mock save function.", answer: "vi.fn()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  {
    id: 65, world: "TESTING", title: "Assertion Match", concept: "Testing", xp: 500, difficulty: 7, type: "build", lesson: "Assert that an element is present.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "expect(button).toBeInTheDocument()", starter: `const button = screen.getByRole("button");
???;`, task: "Assert that the button exists.", answer: "expect(button).toBeInTheDocument()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task."
  },
  {
    id: 66, world: "TESTING", title: "Input Test", concept: "Testing", xp: 500, difficulty: 7, type: "debug", lesson: "Change a controlled input in a test.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "fireEvent.change(input, { target: { value: \"Ada\" } })", starter: `const input = screen.getByRole("textbox");
???;`, task: "Set the input value to Ada.", answer: "fireEvent.change(input, { target: { value: \"Ada\" } })", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task."
  },
  { id: 67, world: "TESTING", title: "Test Cleanup", concept: "Testing", xp: 500, difficulty: 7, type: "build", lesson: "Keep tests isolated by cleaning up mounted UI.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "cleanup()", starter: "afterEach(() => { ???; });", task: "Clean up after each test.", answer: "cleanup()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 68, world: "TESTING", title: "Debug Output", concept: "Testing", xp: 500, difficulty: 7, type: "build", lesson: "Print a rendered node during a test.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "screen.debug()", starter: "it(\"debugs\", () => { render(<App />); ???; });", task: "Print the current DOM tree.", answer: "screen.debug()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 69, world: "ECOSYSTEM", title: "Route Link", concept: "Routing", xp: 500, difficulty: 7, type: "debug", lesson: "Render a navigation link to another route.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<Link to=\"/about\">About</Link>", starter: "function Nav(){ return ???; }", task: "Create a link to /about.", answer: "<Link to=\"/about\">About</Link>", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 70, world: "ECOSYSTEM", title: "Route Path", concept: "Routing", xp: 500, difficulty: 7, type: "build", lesson: "Declare a route path for the dashboard.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "path=\"/dashboard\"", starter: "<Route ??? element={<Dashboard />} />", task: "Set the dashboard route path.", answer: "path=\"/dashboard\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 71, world: "ECOSYSTEM", title: "Navigate Hook", concept: "Routing", xp: 550, difficulty: 8, type: "build", lesson: "Navigate programmatically after an action.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "useNavigate()", starter: "function App(){ const navigate = ???; return <button onClick={()=>navigate(\"/home\")}>Home</button>; }", task: "Create the navigate function.", answer: "useNavigate()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 72, world: "ECOSYSTEM", title: "Search Params", concept: "Routing", xp: 550, difficulty: 8, type: "debug", lesson: "Read query parameters from the URL.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "useSearchParams()", starter: "function App(){ const [params] = ???; return <p>{params.get(\"q\")}</p>; }", task: "Read the URL search params.", answer: "useSearchParams()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 73, world: "ECOSYSTEM", title: "Lazy Module", concept: "Code Splitting", xp: 550, difficulty: 8, type: "build", lesson: "Load a route component lazily.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "lazy(() => import(\"./Dashboard\"))", starter: "const Dashboard = ???;", task: "Lazy-load Dashboard.", answer: "lazy(() => import(\"./Dashboard\"))", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 74, world: "ECOSYSTEM", title: "Suspense Fallback", concept: "Code Splitting", xp: 550, difficulty: 8, type: "build", lesson: "Show fallback UI while a lazy component loads.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<Suspense fallback={<p>Loading...</p>}>", starter: "function App(){ return ???<Dashboard /></Suspense>; }", task: "Add a Suspense fallback.", answer: "<Suspense fallback={<p>Loading...</p>}>", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 75, world: "ECOSYSTEM", title: "Error Boundary", concept: "Error Handling", xp: 550, difficulty: 8, type: "debug", lesson: "Render fallback UI when a child throws.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "componentDidCatch", starter: "class Boundary extends React.Component { ??? }", task: "Add the lifecycle used to catch child errors.", answer: "componentDidCatch", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 76, world: "ECOSYSTEM", title: "Environment Value", concept: "Tooling", xp: 550, difficulty: 8, type: "build", lesson: "Read a Vite environment variable.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "import.meta.env.VITE_API_URL", starter: "const api = ???;", task: "Read the VITE_API_URL environment value.", answer: "import.meta.env.VITE_API_URL", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 77, world: "ECOSYSTEM", title: "Asset URL", concept: "Tooling", xp: 550, difficulty: 8, type: "build", lesson: "Reference a public asset by its root URL.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "src=\"/logo.svg\"", starter: "function App(){ return <img ??? alt=\"logo\" />; }", task: "Use /logo.svg as the image source.", answer: "src=\"/logo.svg\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 78, world: "ECOSYSTEM", title: "Form Action", concept: "Tooling", xp: 550, difficulty: 8, type: "debug", lesson: "Handle a form submit without a page reload.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "e.preventDefault()", starter: "function submit(e){ ???; console.log(\"saved\"); }", task: "Prevent the browser reload.", answer: "e.preventDefault()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 79, world: "ECOSYSTEM", title: "Build Preview", concept: "Tooling", xp: 550, difficulty: 8, type: "build", lesson: "Render a fallback while a component is loading.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "Loading...", starter: "function App(){ const loading=true; return <div>{loading ? ??? : \"Ready\"}</div>; }", task: "Show Loading... while loading.", answer: "\"Loading...\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 80, world: "CAPSTONE", title: "Dashboard Card", concept: "Architecture", xp: 550, difficulty: 8, type: "build", lesson: "Compose a dashboard card from title and value.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<article><h3>{title}</h3><strong>{value}</strong></article>", starter: "function Card({title,value}){ return ???; }", task: "Render a card with title and value.", answer: "<article><h3>{title}</h3><strong>{value}</strong></article>", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 81, world: "CAPSTONE", title: "Status Badge", concept: "Architecture", xp: 600, difficulty: 9, type: "debug", lesson: "Choose a status label from state.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "status === \"ready\" ? \"READY\" : \"WAITING\"", starter: "function App(){ const status=\"ready\"; return <b>{???}</b>; }", task: "Render READY when status is ready.", answer: "status === \"ready\" ? \"READY\" : \"WAITING\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 82, world: "CAPSTONE", title: "Todo Toggle", concept: "State", xp: 600, difficulty: 9, type: "build", lesson: "Toggle a todo item without mutating the old object.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "setTodo({ ...todo, done: !todo.done })", starter: "function App(){ const [todo,setTodo]=useState({done:false}); function toggle(){ ???; } return <button onClick={toggle}>Toggle</button>; }", task: "Toggle done immutably.", answer: "setTodo({ ...todo, done: !todo.done })", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 83, world: "CAPSTONE", title: "Todo Filter", concept: "Lists", xp: 600, difficulty: 9, type: "build", lesson: "Show only unfinished todos.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "todos.filter(todo => !todo.done)", starter: "function App(){ const todos=[]; return <ul>{??? .map(todo => <li key={todo.id}>{todo.text}</li>)}</ul>; }", task: "Filter out completed todos.", answer: "todos.filter(todo => !todo.done)", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 84, world: "CAPSTONE", title: "Modal Gate", concept: "Conditional Rendering", xp: 600, difficulty: 9, type: "debug", lesson: "Render a modal only when open is true.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "{open && <div className=\"modal\">Open</div>}", starter: "function App(){ const open=true; return <main>???</main>; }", task: "Render the modal conditionally.", answer: "{open && <div className=\"modal\">Open</div>}", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 85, world: "CAPSTONE", title: "Form Submit", concept: "Forms", xp: 600, difficulty: 9, type: "build", lesson: "Submit a form using a controlled field and prevent reload.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "onSubmit={handleSubmit}", starter: "function App(){ function handleSubmit(e){e.preventDefault();} return <form ???><button>Save</button></form>; }", task: "Connect handleSubmit to form submission.", answer: "onSubmit={handleSubmit}", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 86, world: "CAPSTONE", title: "Effect Fetch", concept: "Effects", xp: 600, difficulty: 9, type: "build", lesson: "Start an asynchronous data load when a component mounts.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "useEffect(() => { fetch(\"/api/items\"); }, [])", starter: "function App(){ useEffect(() => { ??? }, []); return null; }", task: "Fetch items after mount.", answer: "fetch(\"/api/items\")", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 87, world: "CAPSTONE", title: "Effect Dependency", concept: "Effects", xp: 600, difficulty: 9, type: "debug", lesson: "Rerun an effect when userId changes.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "[userId]", starter: "function App({userId}){ useEffect(()=>{ loadUser(userId); }, ???); return null; }", task: "Depend on userId.", answer: "[userId]", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 88, world: "CAPSTONE", title: "Context Theme", concept: "Context", xp: 600, difficulty: 9, type: "build", lesson: "Read a theme value from context and display it.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "useContext(ThemeContext)", starter: "function App(){ const theme=???; return <p>{theme}</p>; }", task: "Read the theme context.", answer: "useContext(ThemeContext)", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 89, world: "CAPSTONE", title: "Reducer Cart", concept: "useReducer", xp: 600, difficulty: 9, type: "build", lesson: "Add one item to a reducer-managed cart count.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "dispatch({ type: \"add\" })", starter: "function App(){ const [count,dispatch]=useReducer((s,a)=>s+1,0); return <button onClick={()=>???}>Add</button>; }", task: "Dispatch the add action.", answer: "dispatch({ type: \"add\" })", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 90, world: "CAPSTONE", title: "Memo Total", concept: "Performance", xp: 600, difficulty: 9, type: "debug", lesson: "Memoize a derived total from price and quantity.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "useMemo(() => price * qty, [price, qty])", starter: "function App({price,qty}){ const total=???; return <b>{total}</b>; }", task: "Memoize the total.", answer: "useMemo(() => price * qty, [price, qty])", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 91, world: "CAPSTONE", title: "Callback Action", concept: "Performance", xp: 650, difficulty: 10, type: "build", lesson: "Memoize a callback that sends a save request.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "useCallback(() => save(id), [id])", starter: "function App({id}){ const onSave=???; return <button onClick={onSave}>Save</button>; }", task: "Memoize onSave using id.", answer: "useCallback(() => save(id), [id])", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 92, world: "CAPSTONE", title: "Ref Focus", concept: "useRef", xp: 650, difficulty: 10, type: "build", lesson: "Focus an input when a button is clicked.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "inputRef.current?.focus()", starter: "function App(){ const inputRef=useRef(null); function focus(){ ???; } return <><input ref={inputRef}/><button onClick={focus}>Focus</button></>; }", task: "Focus the input through the ref.", answer: "inputRef.current?.focus()", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 93, world: "CAPSTONE", title: "Custom Hook", concept: "Custom Hooks", xp: 650, difficulty: 10, type: "debug", lesson: "Create a hook that returns whether a value is non-empty.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "return value.trim().length > 0", starter: "function useHasText(value){ ??? }", task: "Return true when value has non-whitespace text.", answer: "return value.trim().length > 0", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 94, world: "CAPSTONE", title: "Accessible Label", concept: "Accessibility", xp: 650, difficulty: 10, type: "build", lesson: "Connect a label to an input using htmlFor.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "htmlFor=\"email\"", starter: "function App(){ return <><label ???>Email</label><input id=\"email\" /></>; }", task: "Connect the label to the email input.", answer: "htmlFor=\"email\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 95, world: "CAPSTONE", title: "Button Type", concept: "Accessibility", xp: 650, difficulty: 10, type: "build", lesson: "Prevent a button inside a form from submitting.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "type=\"button\"", starter: "function App(){ return <form><button ???>Cancel</button></form>; }", task: "Make Cancel a non-submit button.", answer: "type=\"button\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 96, world: "CAPSTONE", title: "Image Alt", concept: "Accessibility", xp: 650, difficulty: 10, type: "debug", lesson: "Give an informative image an alt description.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "alt=\"React logo\"", starter: "function App(){ return <img src=\"/react.svg\" ??? />; }", task: "Add an accessible image description.", answer: "alt=\"React logo\"", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 97, world: "CAPSTONE", title: "Loading State", concept: "Async UI", xp: 650, difficulty: 10, type: "build", lesson: "Render a loading message while data is loading.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "loading && <p>Loading...</p>", starter: "function App(){ const loading=true; return <section>{???}</section>; }", task: "Render Loading... when loading is true.", answer: "loading && <p>Loading...</p>", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 98, world: "CAPSTONE", title: "Empty State", concept: "Async UI", xp: 650, difficulty: 10, type: "build", lesson: "Show a message when an array has no items.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "items.length === 0", starter: "function App({items}){ return <div>{??? ? <p>No items</p> : <p>Items found</p>}</div>; }", task: "Detect an empty items array.", answer: "items.length === 0", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 99, world: "CAPSTONE", title: "Error State", concept: "Async UI", xp: 650, difficulty: 10, type: "debug", lesson: "Show an error message when error is present.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "error && <p role=\"alert\">Failed</p>", starter: "function App({error}){ return <div>{???}</div>; }", task: "Render an accessible error alert.", answer: "error && <p role=\"alert\">Failed</p>", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." },
  { id: 100, world: "CAPSTONE", title: "Final Render", concept: "Capstone", xp: 650, difficulty: 10, type: "build", lesson: "Compose a small React screen from multiple semantic sections.", why: "This pattern appears in real React applications and helps make UI behavior predictable.", example: "<main><header>ReactQuest</header><section>Ready</section></main>", starter: "function App(){ return ???; }", task: "Render a semantic ReactQuest screen.", answer: "<main><header>ReactQuest</header><section>Ready</section></main>", hint: "Identify the exact React pattern in the example.", hint2: "Use the code fragment named in the objective.", hint3: "Make the smallest change that satisfies the task." }
];

// Legacy duplicate mission pools removed: the canonical 1-100 missions already contain these entries.

const expansionMissions200 = [
  { id: 101, world: "FOUNDATIONS", title: "JSX Attribute", concept: "JSX attributes", xp: 220, difficulty: 1, type: "build", lesson: "This mission practices JSX attributes in a focused React scenario.", why: "JSX attributes is a practical pattern you will use when building real React interfaces.", example: `className="card"`, starter: `function App(){ return <div ???>Ready</div>; }`, task: "Add the className attribute.", answer: `className="card"`, hint: "Focus on the JSX attributes pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 102, world: "FOUNDATIONS", title: "Expression Math", concept: "JSX expressions", xp: 230, difficulty: 1, type: "build", lesson: "This mission practices JSX expressions in a focused React scenario.", why: "JSX expressions is a practical pattern you will use when building real React interfaces.", example: `{2 + 3}`, starter: `function App(){ return <strong>???</strong>; }`, task: "Render the result of the JavaScript expression.", answer: `{2 + 3}`, hint: "Focus on the JSX expressions pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 103, world: "FOUNDATIONS", title: "Image Alt", concept: "Accessibility", xp: 240, difficulty: 1, type: "build", lesson: "This mission practices Accessibility in a focused React scenario.", why: "Accessibility is a practical pattern you will use when building real React interfaces.", example: `alt="React logo"`, starter: `function App(){ return <img src="/react.png" ??? />; }`, task: "Add alternative text to the image.", answer: `alt="React logo"`, hint: "Focus on the Accessibility pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 104, world: "FOUNDATIONS", title: "Semantic Main", concept: "Semantic HTML", xp: 250, difficulty: 1, type: "build", lesson: "This mission practices Semantic HTML in a focused React scenario.", why: "Semantic HTML is a practical pattern you will use when building real React interfaces.", example: `<main>Quest</main>`, starter: `function App(){ return ???; }`, task: "Use a semantic main element.", answer: `<main>Quest</main>`, hint: "Focus on the Semantic HTML pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 105, world: "FOUNDATIONS", title: "Button Label", concept: "JSX text", xp: 260, difficulty: 1, type: "build", lesson: "This mission practices JSX text in a focused React scenario.", why: "JSX text is a practical pattern you will use when building real React interfaces.", example: `Launch`, starter: `function App(){ return <button>???</button>; }`, task: "Render the Launch label.", answer: `Launch`, hint: "Focus on the JSX text pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 106, world: "FOUNDATIONS", title: "Nested Markup", concept: "JSX nesting", xp: 270, difficulty: 1, type: "build", lesson: "This mission practices JSX nesting in a focused React scenario.", why: "JSX nesting is a practical pattern you will use when building real React interfaces.", example: `<span>XP</span>`, starter: `function App(){ return <section>???</section>; }`, task: "Place the XP span inside the section.", answer: `<span>XP</span>`, hint: "Focus on the JSX nesting pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 107, world: "FOUNDATIONS", title: "Expression Variable", concept: "JSX expressions", xp: 280, difficulty: 1, type: "build", lesson: "This mission practices JSX expressions in a focused React scenario.", why: "JSX expressions is a practical pattern you will use when building real React interfaces.", example: `{score}`, starter: `function App(){ const score=99; return <b>???</b>; }`, task: "Render the score variable.", answer: `{score}`, hint: "Focus on the JSX expressions pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 108, world: "FOUNDATIONS", title: "Class Fix", concept: "JSX attributes", xp: 290, difficulty: 1, type: "debug", lesson: "This mission practices JSX attributes in a focused React scenario.", why: "JSX attributes is a practical pattern you will use when building real React interfaces.", example: `className="hero"`, starter: `function App(){ return <section class="hero">Quest</section>; }`, task: "Fix the HTML class attribute for React.", answer: `className="hero"`, hint: "Focus on the JSX attributes pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 109, world: "FOUNDATIONS", title: "Fragment Pair", concept: "Fragments", xp: 300, difficulty: 1, type: "build", lesson: "This mission practices Fragments in a focused React scenario.", why: "Fragments is a practical pattern you will use when building real React interfaces.", example: `<><h2>One</h2><p>Two</p></>`, starter: `function App(){ return ???; }`, task: "Return two siblings with a Fragment.", answer: `<><h2>One</h2><p>Two</p></>`, hint: "Focus on the Fragments pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 110, world: "FOUNDATIONS", title: "Alt Label", concept: "Accessibility", xp: 310, difficulty: 1, type: "build", lesson: "This mission practices Accessibility in a focused React scenario.", why: "Accessibility is a practical pattern you will use when building real React interfaces.", example: `alt="Quest icon"`, starter: `function App(){ return <img src="/quest.png" ??? />; }`, task: "Give the decorative image useful alternative text.", answer: `alt="Quest icon"`, hint: "Focus on the Accessibility pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 111, world: "PROPS", title: "Prop Read", concept: "Props", xp: 265, difficulty: 2, type: "build", lesson: "This mission practices Props in a focused React scenario.", why: "Props is a practical pattern you will use when building real React interfaces.", example: `{name}`, starter: `function Badge({name}){ return <span>???</span>; }`, task: "Render the name prop.", answer: `{name}`, hint: "Focus on the Props pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 112, world: "PROPS", title: "Title Prop", concept: "Props", xp: 275, difficulty: 2, type: "build", lesson: "This mission practices Props in a focused React scenario.", why: "Props is a practical pattern you will use when building real React interfaces.", example: `{title}`, starter: `function Card({title}){ return <h3>???</h3>; }`, task: "Render the title prop.", answer: `{title}`, hint: "Focus on the Props pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 113, world: "PROPS", title: "Numeric Prop", concept: "Props", xp: 285, difficulty: 2, type: "build", lesson: "This mission practices Props in a focused React scenario.", why: "Props is a practical pattern you will use when building real React interfaces.", example: `score={100}`, starter: `function App(){ return <Score ??? />; }`, task: "Pass a numeric score prop.", answer: `score={100}`, hint: "Focus on the Props pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 114, world: "PROPS", title: "Boolean Prop", concept: "Boolean props", xp: 295, difficulty: 2, type: "build", lesson: "This mission practices Boolean props in a focused React scenario.", why: "Boolean props is a practical pattern you will use when building real React interfaces.", example: `disabled`, starter: `function App(){ return <button ???>Locked</button>; }`, task: "Disable the button with JSX shorthand.", answer: `disabled`, hint: "Focus on the Boolean props pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 115, world: "PROPS", title: "String Prop", concept: "Props", xp: 305, difficulty: 2, type: "build", lesson: "This mission practices Props in a focused React scenario.", why: "Props is a practical pattern you will use when building real React interfaces.", example: `label="START"`, starter: `function App(){ return <Button ??? />; }`, task: "Pass the START label.", answer: `label="START"`, hint: "Focus on the Props pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 116, world: "PROPS", title: "Children Slot", concept: "children", xp: 315, difficulty: 2, type: "build", lesson: "This mission practices children in a focused React scenario.", why: "children is a practical pattern you will use when building real React interfaces.", example: `{children}`, starter: `function Panel({children}){ return <section>???</section>; }`, task: "Render children inside the panel.", answer: `{children}`, hint: "Focus on the children pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 117, world: "PROPS", title: "Default Prop", concept: "Default parameters", xp: 325, difficulty: 2, type: "build", lesson: "This mission practices Default parameters in a focused React scenario.", why: "Default parameters is a practical pattern you will use when building real React interfaces.", example: `size = "md"`, starter: `function Badge({size ???}){ return <span>{size}</span>; }`, task: "Give size a md default.", answer: `size = "md"`, hint: "Focus on the Default parameters pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 118, world: "PROPS", title: "Prop Forward", concept: "Prop forwarding", xp: 335, difficulty: 2, type: "build", lesson: "This mission practices Prop forwarding in a focused React scenario.", why: "Prop forwarding is a practical pattern you will use when building real React interfaces.", example: `title={title}`, starter: `function App({title}){ return <Card ??? />; }`, task: "Forward the title prop.", answer: `title={title}`, hint: "Focus on the Prop forwarding pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 119, world: "PROPS", title: "Prop Callback", concept: "Callback props", xp: 345, difficulty: 2, type: "build", lesson: "This mission practices Callback props in a focused React scenario.", why: "Callback props is a practical pattern you will use when building real React interfaces.", example: `onSave={onSave}`, starter: `function App({onSave}){ return <Editor ??? />; }`, task: "Pass the callback to the child.", answer: `onSave={onSave}`, hint: "Focus on the Callback props pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 120, world: "PROPS", title: "Active Prop", concept: "Conditional props", xp: 355, difficulty: 2, type: "build", lesson: "This mission practices Conditional props in a focused React scenario.", why: "Conditional props is a practical pattern you will use when building real React interfaces.", example: `{active && <span>Active</span>}`, starter: `function Badge({active}){ return <div>???</div>; }`, task: "Show Active only when active.", answer: `{active && <span>Active</span>}`, hint: "Focus on the Conditional props pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 121, world: "EVENTS", title: "Click Handler", concept: "Events", xp: 310, difficulty: 3, type: "build", lesson: "This mission practices Events in a focused React scenario.", why: "Events is a practical pattern you will use when building real React interfaces.", example: `onClick={handleClick}`, starter: `function App(){ const handleClick=()=>console.log("clicked"); return <button ???>Click</button>; }`, task: "Attach the click handler.", answer: `onClick={handleClick}`, hint: "Focus on the Events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 122, world: "EVENTS", title: "Change Handler", concept: "Events", xp: 320, difficulty: 3, type: "build", lesson: "This mission practices Events in a focused React scenario.", why: "Events is a practical pattern you will use when building real React interfaces.", example: `onChange={handleChange}`, starter: `function App(){ const handleChange=e=>console.log(e.target.value); return <input ??? />; }`, task: "Attach the change handler.", answer: `onChange={handleChange}`, hint: "Focus on the Events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 123, world: "EVENTS", title: "Submit Guard", concept: "Forms", xp: 330, difficulty: 3, type: "debug", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `e.preventDefault()`, starter: `function submit(e){ ??? }`, task: "Prevent the default form submission.", answer: `e.preventDefault()`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 124, world: "EVENTS", title: "Escape Key", concept: "Keyboard events", xp: 340, difficulty: 3, type: "build", lesson: "This mission practices Keyboard events in a focused React scenario.", why: "Keyboard events is a practical pattern you will use when building real React interfaces.", example: `e.key === "Escape"`, starter: `function onKey(e){ if(???) console.log("close"); }`, task: "Detect the Escape key.", answer: `e.key === "Escape"`, hint: "Focus on the Keyboard events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 125, world: "EVENTS", title: "Stop Bubble", concept: "Event propagation", xp: 350, difficulty: 3, type: "debug", lesson: "This mission practices Event propagation in a focused React scenario.", why: "Event propagation is a practical pattern you will use when building real React interfaces.", example: `e.stopPropagation()`, starter: `function onIconClick(e){ ??? }`, task: "Stop the child click from bubbling.", answer: `e.stopPropagation()`, hint: "Focus on the Event propagation pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 126, world: "EVENTS", title: "Double Click", concept: "Events", xp: 360, difficulty: 3, type: "build", lesson: "This mission practices Events in a focused React scenario.", why: "Events is a practical pattern you will use when building real React interfaces.", example: `onDoubleClick={handleDouble}`, starter: `function App(){ const handleDouble=()=>{}; return <button ???>Open</button>; }`, task: "Attach the double-click handler.", answer: `onDoubleClick={handleDouble}`, hint: "Focus on the Events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 127, world: "EVENTS", title: "Focus Handler", concept: "Focus events", xp: 370, difficulty: 3, type: "build", lesson: "This mission practices Focus events in a focused React scenario.", why: "Focus events is a practical pattern you will use when building real React interfaces.", example: `onFocus={handleFocus}`, starter: `function App(){ const handleFocus=()=>{}; return <input ??? />; }`, task: "Attach the focus handler.", answer: `onFocus={handleFocus}`, hint: "Focus on the Focus events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 128, world: "EVENTS", title: "Blur Handler", concept: "Focus events", xp: 380, difficulty: 3, type: "build", lesson: "This mission practices Focus events in a focused React scenario.", why: "Focus events is a practical pattern you will use when building real React interfaces.", example: `onBlur={handleBlur}`, starter: `function App(){ const handleBlur=()=>{}; return <input ??? />; }`, task: "Attach the blur handler.", answer: `onBlur={handleBlur}`, hint: "Focus on the Focus events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 129, world: "EVENTS", title: "Pointer Enter", concept: "Pointer events", xp: 390, difficulty: 3, type: "build", lesson: "This mission practices Pointer events in a focused React scenario.", why: "Pointer events is a practical pattern you will use when building real React interfaces.", example: `onPointerEnter={handleEnter}`, starter: `function App(){ const handleEnter=()=>{}; return <div ???>Hover</div>; }`, task: "Attach the pointer-enter handler.", answer: `onPointerEnter={handleEnter}`, hint: "Focus on the Pointer events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 130, world: "EVENTS", title: "Event Target", concept: "Events", xp: 400, difficulty: 3, type: "build", lesson: "This mission practices Events in a focused React scenario.", why: "Events is a practical pattern you will use when building real React interfaces.", example: `e.currentTarget`, starter: `function handle(e){ console.log(???); }`, task: "Read the current target.", answer: `e.currentTarget`, hint: "Focus on the Events pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 131, world: "STATE", title: "Counter State", concept: "useState", xp: 355, difficulty: 4, type: "build", lesson: "This mission practices useState in a focused React scenario.", why: "useState is a practical pattern you will use when building real React interfaces.", example: `useState(0)`, starter: `function App(){ const [count,setCount]=???; return <p>{count}</p>; }`, task: "Create count state starting at zero.", answer: `useState(0)`, hint: "Focus on the useState pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 132, world: "STATE", title: "Toggle State", concept: "useState", xp: 365, difficulty: 4, type: "build", lesson: "This mission practices useState in a focused React scenario.", why: "useState is a practical pattern you will use when building real React interfaces.", example: `setOpen(!open)`, starter: `function App(){ const [open,setOpen]=useState(false); return <button onClick={()=>???}>{String(open)}</button>; }`, task: "Toggle the open state.", answer: `setOpen(!open)`, hint: "Focus on the useState pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 133, world: "STATE", title: "Functional Update", concept: "State updates", xp: 375, difficulty: 4, type: "build", lesson: "This mission practices State updates in a focused React scenario.", why: "State updates is a practical pattern you will use when building real React interfaces.", example: `setCount(c => c + 1)`, starter: `function App(){ const [count,setCount]=useState(0); return <button onClick={()=>???}>{count}</button>; }`, task: "Increment with a functional update.", answer: `setCount(c => c + 1)`, hint: "Focus on the State updates pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 134, world: "STATE", title: "Object Spread", concept: "State objects", xp: 385, difficulty: 4, type: "build", lesson: "This mission practices State objects in a focused React scenario.", why: "State objects is a practical pattern you will use when building real React interfaces.", example: `setUser({...user, level: user.level + 1})`, starter: `function App(){ const [user,setUser]=useState({name:"Ada",level:1}); return <button onClick={()=>???}>Level</button>; }`, task: "Update level without losing other fields.", answer: `setUser({...user, level: user.level + 1})`, hint: "Focus on the State objects pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 135, world: "STATE", title: "Array Add", concept: "State arrays", xp: 395, difficulty: 4, type: "build", lesson: "This mission practices State arrays in a focused React scenario.", why: "State arrays is a practical pattern you will use when building real React interfaces.", example: `setItems([...items, "XP"])`, starter: `function App(){ const [items,setItems]=useState([]); return <button onClick={()=>???}>Add</button>; }`, task: "Add an item immutably.", answer: `setItems([...items, "XP"])`, hint: "Focus on the State arrays pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 136, world: "STATE", title: "Array Remove", concept: "State arrays", xp: 405, difficulty: 4, type: "build", lesson: "This mission practices State arrays in a focused React scenario.", why: "State arrays is a practical pattern you will use when building real React interfaces.", example: `setItems(items.filter(x => x !== "old"))`, starter: `function App(){ const [items,setItems]=useState(["old","new"]); return <button onClick={()=>???}>Remove</button>; }`, task: "Remove an item with filter.", answer: `setItems(items.filter(x => x !== "old"))`, hint: "Focus on the State arrays pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 137, world: "STATE", title: "State Reset", concept: "State", xp: 415, difficulty: 4, type: "build", lesson: "This mission practices State in a focused React scenario.", why: "State is a practical pattern you will use when building real React interfaces.", example: `setCount(0)`, starter: `function App(){ const [count,setCount]=useState(7); return <button onClick={()=>???}>{count}</button>; }`, task: "Reset the counter to zero.", answer: `setCount(0)`, hint: "Focus on the State pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 138, world: "STATE", title: "Derived Total", concept: "Derived state", xp: 425, difficulty: 4, type: "build", lesson: "This mission practices Derived state in a focused React scenario.", why: "Derived state is a practical pattern you will use when building real React interfaces.", example: `const total = price * qty`, starter: `function App(){ const price=5, qty=3; ???; return <p>{total}</p>; }`, task: "Calculate a derived total.", answer: `const total = price * qty`, hint: "Focus on the Derived state pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 139, world: "STATE", title: "Lazy Initializer", concept: "useState", xp: 435, difficulty: 4, type: "build", lesson: "This mission practices useState in a focused React scenario.", why: "useState is a practical pattern you will use when building real React interfaces.", example: `useState(() => 42)`, starter: `function App(){ const [score] = ???; return <p>{score}</p>; }`, task: "Use a lazy initializer.", answer: `useState(() => 42)`, hint: "Focus on the useState pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 140, world: "STATE", title: "State Snapshot", concept: "State", xp: 445, difficulty: 4, type: "build", lesson: "This mission practices State in a focused React scenario.", why: "State is a practical pattern you will use when building real React interfaces.", example: `setValue(value + 1)`, starter: `function App(){ const [value,setValue]=useState(0); return <button onClick={()=>???}>{value}</button>; }`, task: "Update state from the current render snapshot.", answer: `setValue(value + 1)`, hint: "Focus on the State pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 141, world: "RENDERING", title: "Logical AND", concept: "Conditional rendering", xp: 400, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `{ready && <p>Ready</p>}`, starter: `function App({ready}){ return <section>???</section>; }`, task: "Render Ready only when ready.", answer: `{ready && <p>Ready</p>}`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 142, world: "RENDERING", title: "Ternary View", concept: "Conditional rendering", xp: 410, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `ready ? <Online /> : <Offline />`, starter: `function App({ready}){ return ???; }`, task: "Choose the online or offline view.", answer: `ready ? <Online /> : <Offline />`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 143, world: "RENDERING", title: "Null Branch", concept: "Conditional rendering", xp: 420, difficulty: 5, type: "debug", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `return null`, starter: `function Empty(){ ??? }`, task: "Render nothing from the component.", answer: `return null`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 144, world: "RENDERING", title: "Status Label", concept: "Conditional rendering", xp: 430, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `online ? "ONLINE" : "OFFLINE"`, starter: `function Status({online}){ return <b>{???}</b>; }`, task: "Show the correct status label.", answer: `online ? "ONLINE" : "OFFLINE"`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 145, world: "RENDERING", title: "Guard Clause", concept: "Conditional rendering", xp: 440, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `if (!user) return null;`, starter: `function Profile({user}){ ??? return <h2>{user.name}</h2>; }`, task: "Stop rendering when user is missing.", answer: `if (!user) return null;`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 146, world: "RENDERING", title: "Loading State", concept: "Conditional rendering", xp: 450, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `loading ? <Spinner /> : <Content />`, starter: `function App({loading}){ return ???; }`, task: "Show a spinner while loading.", answer: `loading ? <Spinner /> : <Content />`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 147, world: "RENDERING", title: "Error State", concept: "Conditional rendering", xp: 460, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `error ? <Error /> : <Content />`, starter: `function App({error}){ return ???; }`, task: "Show an error view when error exists.", answer: `error ? <Error /> : <Content />`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 148, world: "RENDERING", title: "Empty State", concept: "Conditional rendering", xp: 470, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `items.length === 0 ? <Empty /> : <List />`, starter: `function App({items}){ return ???; }`, task: "Show Empty when there are no items.", answer: `items.length === 0 ? <Empty /> : <List />`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 149, world: "RENDERING", title: "Feature Flag", concept: "Conditional rendering", xp: 480, difficulty: 5, type: "build", lesson: "This mission practices Conditional rendering in a focused React scenario.", why: "Conditional rendering is a practical pattern you will use when building real React interfaces.", example: `enabled && <Beta />`, starter: `function App({enabled}){ return <main>{???}</main>; }`, task: "Render Beta only when enabled.", answer: `enabled && <Beta />`, hint: "Focus on the Conditional rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 150, world: "RENDERING", title: "Render Function", concept: "Rendering", xp: 490, difficulty: 5, type: "build", lesson: "This mission practices Rendering in a focused React scenario.", why: "Rendering is a practical pattern you will use when building real React interfaces.", example: `return <h1>Hello</h1>`, starter: `function App(){ ??? }`, task: "Return JSX from the component.", answer: `return <h1>Hello</h1>`, hint: "Focus on the Rendering pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 151, world: "LISTS", title: "Map Items", concept: "Lists", xp: 445, difficulty: 6, type: "build", lesson: "This mission practices Lists in a focused React scenario.", why: "Lists is a practical pattern you will use when building real React interfaces.", example: `items.map(item => <li key={item.id}>{item.name}</li>)`, starter: `function App({items}){ return <ul>{???}</ul>; }`, task: "Map items into keyed list elements.", answer: `items.map(item => <li key={item.id}>{item.name}</li>)`, hint: "Focus on the Lists pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 152, world: "LISTS", title: "Stable ID Key", concept: "Keys", xp: 455, difficulty: 6, type: "build", lesson: "This mission practices Keys in a focused React scenario.", why: "Keys is a practical pattern you will use when building real React interfaces.", example: `key={item.id}`, starter: `function Row({item}){ return <li ???>{item.name}</li>; }`, task: "Use item.id as the key.", answer: `key={item.id}`, hint: "Focus on the Keys pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 153, world: "LISTS", title: "Filter Then Map", concept: "Lists", xp: 465, difficulty: 6, type: "build", lesson: "This mission practices Lists in a focused React scenario.", why: "Lists is a practical pattern you will use when building real React interfaces.", example: `items.filter(item => item.active).map(item => <li key={item.id}>{item.name}</li>)`, starter: `function App({items}){ return <ul>{???}</ul>; }`, task: "Render only active items.", answer: `items.filter(item => item.active).map(item => <li key={item.id}>{item.name}</li>)`, hint: "Focus on the Lists pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 154, world: "LISTS", title: "Sorted Copy", concept: "Immutable arrays", xp: 475, difficulty: 6, type: "build", lesson: "This mission practices Immutable arrays in a focused React scenario.", why: "Immutable arrays is a practical pattern you will use when building real React interfaces.", example: `[...items].sort()`, starter: `function App({items}){ const sorted = ???; return <List items={sorted}/>; }`, task: "Sort without mutating the original array.", answer: `[...items].sort()`, hint: "Focus on the Immutable arrays pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 155, world: "LISTS", title: "Find Item", concept: "Array methods", xp: 485, difficulty: 6, type: "build", lesson: "This mission practices Array methods in a focused React scenario.", why: "Array methods is a practical pattern you will use when building real React interfaces.", example: `items.find(item => item.id === id)`, starter: `function getItem(items,id){ return ???; }`, task: "Find the matching item.", answer: `items.find(item => item.id === id)`, hint: "Focus on the Array methods pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 156, world: "LISTS", title: "Some Check", concept: "Array methods", xp: 495, difficulty: 6, type: "build", lesson: "This mission practices Array methods in a focused React scenario.", why: "Array methods is a practical pattern you will use when building real React interfaces.", example: `items.some(item => item.done)`, starter: `function hasDone(items){ return ???; }`, task: "Check whether any item is done.", answer: `items.some(item => item.done)`, hint: "Focus on the Array methods pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 157, world: "LISTS", title: "Every Check", concept: "Array methods", xp: 505, difficulty: 6, type: "build", lesson: "This mission practices Array methods in a focused React scenario.", why: "Array methods is a practical pattern you will use when building real React interfaces.", example: `items.every(item => item.done)`, starter: `function allDone(items){ return ???; }`, task: "Check whether every item is done.", answer: `items.every(item => item.done)`, hint: "Focus on the Array methods pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 158, world: "LISTS", title: "Reduce Total", concept: "Array methods", xp: 515, difficulty: 6, type: "build", lesson: "This mission practices Array methods in a focused React scenario.", why: "Array methods is a practical pattern you will use when building real React interfaces.", example: `items.reduce((sum,item) => sum + item.price, 0)`, starter: `function total(items){ return ???; }`, task: "Calculate the total price.", answer: `items.reduce((sum,item) => sum + item.price, 0)`, hint: "Focus on the Array methods pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 159, world: "LISTS", title: "Key Warning", concept: "Keys", xp: 525, difficulty: 6, type: "debug", lesson: "This mission practices Keys in a focused React scenario.", why: "Keys is a practical pattern you will use when building real React interfaces.", example: `key={item.id}`, starter: `items.map((item,index) => <Row key={index} item={item} />);`, task: "Replace the index key with item.id.", answer: `key={item.id}`, hint: "Focus on the Keys pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 160, world: "LISTS", title: "Empty List", concept: "Lists", xp: 535, difficulty: 6, type: "build", lesson: "This mission practices Lists in a focused React scenario.", why: "Lists is a practical pattern you will use when building real React interfaces.", example: `items.length === 0`, starter: `function EmptyCheck({items}){ return <p>{??? ? "Empty" : "Has items"}</p>; }`, task: "Check whether the list is empty.", answer: `items.length === 0`, hint: "Focus on the Lists pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 161, world: "FORMS", title: "Controlled Input", concept: "Forms", xp: 490, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `value={name}`, starter: `function App(){ const [name,setName]=useState(""); return <input ??? onChange={e=>setName(e.target.value)} />; }`, task: "Control the input with name.", answer: `value={name}`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 162, world: "FORMS", title: "Controlled Select", concept: "Forms", xp: 500, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `value={role}`, starter: `function App(){ const [role,setRole]=useState("dev"); return <select ??? onChange={e=>setRole(e.target.value)}><option>dev</option></select>; }`, task: "Control the select with role.", answer: `value={role}`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 163, world: "FORMS", title: "Checkbox Value", concept: "Forms", xp: 510, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `checked={done}`, starter: `function App(){ const [done,setDone]=useState(false); return <input type="checkbox" ??? onChange={e=>setDone(e.target.checked)} />; }`, task: "Control the checkbox with done.", answer: `checked={done}`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 164, world: "FORMS", title: "Textarea Control", concept: "Forms", xp: 520, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `value={note}`, starter: `function App(){ const [note,setNote]=useState(""); return <textarea ??? onChange={e=>setNote(e.target.value)} />; }`, task: "Control the textarea with note.", answer: `value={note}`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 165, world: "FORMS", title: "Form Submit", concept: "Forms", xp: 530, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `onSubmit={handleSubmit}`, starter: `function App(){ const handleSubmit=e=>e.preventDefault(); return <form ???><button>Save</button></form>; }`, task: "Attach the submit handler.", answer: `onSubmit={handleSubmit}`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 166, world: "FORMS", title: "Required Field", concept: "Forms", xp: 540, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `required`, starter: `function App(){ return <input ??? placeholder="Name" />; }`, task: "Mark the field as required.", answer: `required`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 167, world: "FORMS", title: "Email Type", concept: "Forms", xp: 550, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `type="email"`, starter: `function App(){ return <input ??? />; }`, task: "Use the email input type.", answer: `type="email"`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 168, world: "FORMS", title: "Form Reset", concept: "Forms", xp: 560, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `e.currentTarget.reset()`, starter: `function handleSubmit(e){ e.preventDefault(); ??? }`, task: "Reset the submitted form.", answer: `e.currentTarget.reset()`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 169, world: "FORMS", title: "Validation Message", concept: "Forms", xp: 570, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `error && <p>{error}</p>`, starter: `function App({error}){ return <div>{???}</div>; }`, task: "Show the error message when present.", answer: `error && <p>{error}</p>`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 170, world: "FORMS", title: "Submit Button", concept: "Forms", xp: 580, difficulty: 7, type: "build", lesson: "This mission practices Forms in a focused React scenario.", why: "Forms is a practical pattern you will use when building real React interfaces.", example: `type="submit"`, starter: `function App(){ return <form><button ???>Save</button></form>; }`, task: "Make the button submit the form.", answer: `type="submit"`, hint: "Focus on the Forms pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 171, world: "EFFECTS", title: "Effect Basic", concept: "useEffect", xp: 535, difficulty: 8, type: "build", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `useEffect(() => { console.log("mounted"); }, [])`, starter: `function App(){ ??? return <p>Ready</p>; }`, task: "Run an effect once after mount.", answer: `useEffect(() => { console.log("mounted"); }, [])`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 172, world: "EFFECTS", title: "Effect Dependency", concept: "useEffect", xp: 545, difficulty: 8, type: "build", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `[query]`, starter: `function App({query}){ useEffect(()=>console.log(query), ???); return null; }`, task: "Run the effect when query changes.", answer: `[query]`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 173, world: "EFFECTS", title: "Cleanup Listener", concept: "useEffect", xp: 555, difficulty: 8, type: "build", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `return () => window.removeEventListener("resize", onResize)`, starter: `function App(){ function onResize(){} useEffect(()=>{ window.addEventListener("resize",onResize); ??? },[]); return null; }`, task: "Remove the resize listener during cleanup.", answer: `return () => window.removeEventListener("resize", onResize)`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 174, world: "EFFECTS", title: "Document Title", concept: "useEffect", xp: 565, difficulty: 8, type: "build", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `document.title = title`, starter: `function App({title}){ useEffect(()=>{ ??? },[title]); return null; }`, task: "Synchronize the document title.", answer: `document.title = title`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 175, world: "EFFECTS", title: "Interval Cleanup", concept: "useEffect", xp: 575, difficulty: 8, type: "debug", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `return () => clearInterval(id)`, starter: `useEffect(()=>{ const id=setInterval(tick,1000); ??? },[]);`, task: "Clean up the interval.", answer: `return () => clearInterval(id)`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 176, world: "EFFECTS", title: "Timeout Cleanup", concept: "useEffect", xp: 585, difficulty: 8, type: "debug", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `return () => clearTimeout(id)`, starter: `useEffect(()=>{ const id=setTimeout(done,1000); ??? },[]);`, task: "Clean up the timeout.", answer: `return () => clearTimeout(id)`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 177, world: "EFFECTS", title: "Fetch Effect", concept: "useEffect", xp: 595, difficulty: 8, type: "build", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `useEffect(() => { fetch("/api/quests"); }, [])`, starter: `function App(){ ??? return <p>Loading</p>; }`, task: "Start a fetch after mount.", answer: `useEffect(() => { fetch("/api/quests"); }, [])`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 178, world: "EFFECTS", title: "Abort Controller", concept: "Async effects", xp: 605, difficulty: 8, type: "build", lesson: "This mission practices Async effects in a focused React scenario.", why: "Async effects is a practical pattern you will use when building real React interfaces.", example: `const controller = new AbortController()`, starter: `function App(){ useEffect(()=>{ ???; fetch("/api", {signal: controller.signal}); },[]); return null; }`, task: "Create an AbortController.", answer: `const controller = new AbortController()`, hint: "Focus on the Async effects pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 179, world: "EFFECTS", title: "Effect Callback", concept: "useEffect", xp: 615, difficulty: 8, type: "build", lesson: "This mission practices useEffect in a focused React scenario.", why: "useEffect is a practical pattern you will use when building real React interfaces.", example: `useEffect(() => {`, starter: `function App(){ ??? console.log("sync"); }, []); return null; }`, task: "Start the effect with a callback.", answer: `useEffect(() => {`, hint: "Focus on the useEffect pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 180, world: "EFFECTS", title: "Derived Without Effect", concept: "Derived state", xp: 625, difficulty: 8, type: "debug", lesson: "This mission practices Derived state in a focused React scenario.", why: "Derived state is a practical pattern you will use when building real React interfaces.", example: `const fullName = first + " " + last`, starter: `function App({first,last}){ ???; return <p>{fullName}</p>; }`, task: "Calculate fullName during render instead of using an effect.", answer: `const fullName = first + " " + last`, hint: "Focus on the Derived state pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 181, world: "HOOKS", title: "Ref Attach", concept: "useRef", xp: 580, difficulty: 9, type: "build", lesson: "This mission practices useRef in a focused React scenario.", why: "useRef is a practical pattern you will use when building real React interfaces.", example: `ref={inputRef}`, starter: `function App(){ const inputRef=useRef(null); return <input ??? />; }`, task: "Attach the ref to the input.", answer: `ref={inputRef}`, hint: "Focus on the useRef pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 182, world: "HOOKS", title: "Ref Read", concept: "useRef", xp: 590, difficulty: 9, type: "build", lesson: "This mission practices useRef in a focused React scenario.", why: "useRef is a practical pattern you will use when building real React interfaces.", example: `inputRef.current`, starter: `function App(){ const inputRef=useRef(null); function focus(){ ???.focus(); } return <button onClick={focus}>Focus</button>; }`, task: "Read the current DOM node.", answer: `inputRef.current`, hint: "Focus on the useRef pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 183, world: "HOOKS", title: "Memo Value", concept: "useMemo", xp: 600, difficulty: 9, type: "build", lesson: "This mission practices useMemo in a focused React scenario.", why: "useMemo is a practical pattern you will use when building real React interfaces.", example: `useMemo(() => price * qty, [price, qty])`, starter: `function App({price,qty}){ const total=???; return <p>{total}</p>; }`, task: "Memoize the total calculation.", answer: `useMemo(() => price * qty, [price, qty])`, hint: "Focus on the useMemo pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 184, world: "HOOKS", title: "Memo Callback", concept: "useCallback", xp: 610, difficulty: 9, type: "build", lesson: "This mission practices useCallback in a focused React scenario.", why: "useCallback is a practical pattern you will use when building real React interfaces.", example: `useCallback(() => save(id), [id])`, starter: `function App({id,save}){ const onSave=???; return <button onClick={onSave}>Save</button>; }`, task: "Memoize the save callback.", answer: `useCallback(() => save(id), [id])`, hint: "Focus on the useCallback pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 185, world: "HOOKS", title: "Reducer Init", concept: "useReducer", xp: 620, difficulty: 9, type: "build", lesson: "This mission practices useReducer in a focused React scenario.", why: "useReducer is a practical pattern you will use when building real React interfaces.", example: `useReducer(reducer, 0)`, starter: `function App(){ const [count,dispatch]=???; return <p>{count}</p>; }`, task: "Initialize the reducer with zero.", answer: `useReducer(reducer, 0)`, hint: "Focus on the useReducer pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 186, world: "HOOKS", title: "Reducer Dispatch", concept: "useReducer", xp: 630, difficulty: 9, type: "build", lesson: "This mission practices useReducer in a focused React scenario.", why: "useReducer is a practical pattern you will use when building real React interfaces.", example: `dispatch({ type: "inc" })`, starter: `function App(){ const [count,dispatch]=useReducer((s,a)=>s+1,0); return <button onClick={()=>???}>+</button>; }`, task: "Dispatch the increment action.", answer: `dispatch({ type: "inc" })`, hint: "Focus on the useReducer pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 187, world: "HOOKS", title: "Context Read", concept: "useContext", xp: 640, difficulty: 9, type: "build", lesson: "This mission practices useContext in a focused React scenario.", why: "useContext is a practical pattern you will use when building real React interfaces.", example: `useContext(ThemeContext)`, starter: `function App(){ const theme=???; return <p>{theme}</p>; }`, task: "Read the theme context.", answer: `useContext(ThemeContext)`, hint: "Focus on the useContext pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 188, world: "HOOKS", title: "Context Create", concept: "createContext", xp: 650, difficulty: 9, type: "build", lesson: "This mission practices createContext in a focused React scenario.", why: "createContext is a practical pattern you will use when building real React interfaces.", example: `createContext("light")`, starter: `const ThemeContext = ???; function App(){ return <p>Theme</p>; }`, task: "Create a context with a light default.", answer: `createContext("light")`, hint: "Focus on the createContext pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 189, world: "HOOKS", title: "Custom Hook Return", concept: "Custom hooks", xp: 660, difficulty: 9, type: "build", lesson: "This mission practices Custom hooks in a focused React scenario.", why: "Custom hooks is a practical pattern you will use when building real React interfaces.", example: `return value * 2`, starter: `function useDouble(value){ ??? }`, task: "Return the transformed value from the hook.", answer: `return value * 2`, hint: "Focus on the Custom hooks pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 190, world: "HOOKS", title: "Hook Naming", concept: "Custom hooks", xp: 670, difficulty: 9, type: "build", lesson: "This mission practices Custom hooks in a focused React scenario.", why: "Custom hooks is a practical pattern you will use when building real React interfaces.", example: `function useOnline()`, starter: `??? { return true; }`, task: "Define a custom hook using the use prefix.", answer: `function useOnline()`, hint: "Focus on the Custom hooks pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 191, world: "ARCHITECTURE", title: "Composition", concept: "Composition", xp: 625, difficulty: 10, type: "build", lesson: "This mission practices Composition in a focused React scenario.", why: "Composition is a practical pattern you will use when building real React interfaces.", example: `<Header /><Main /><Footer />`, starter: `function App(){ return <main>???</main>; }`, task: "Compose the page from three components.", answer: `<Header /><Main /><Footer />`, hint: "Focus on the Composition pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 192, world: "ARCHITECTURE", title: "Render Prop", concept: "Composition", xp: 635, difficulty: 10, type: "build", lesson: "This mission practices Composition in a focused React scenario.", why: "Composition is a practical pattern you will use when building real React interfaces.", example: `{children}`, starter: `function Layout({children}){ return <section>???</section>; }`, task: "Render children inside the layout.", answer: `{children}`, hint: "Focus on the Composition pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 193, world: "ARCHITECTURE", title: "Error Catch", concept: "Error handling", xp: 645, difficulty: 10, type: "build", lesson: "This mission practices Error handling in a focused React scenario.", why: "Error handling is a practical pattern you will use when building real React interfaces.", example: `componentDidCatch(error)`, starter: `class Boundary extends React.Component { ??? render(){ return this.props.children; } }`, task: "Add the error boundary lifecycle method.", answer: `componentDidCatch(error)`, hint: "Focus on the Error handling pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 194, world: "ARCHITECTURE", title: "Fallback UI", concept: "Error handling", xp: 655, difficulty: 10, type: "build", lesson: "This mission practices Error handling in a focused React scenario.", why: "Error handling is a practical pattern you will use when building real React interfaces.", example: `hasError ? <h1>Oops</h1> : children`, starter: `function View({hasError,children}){ return ???; }`, task: "Render the fallback when hasError is true.", answer: `hasError ? <h1>Oops</h1> : children`, hint: "Focus on the Error handling pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 195, world: "ARCHITECTURE", title: "Memo Child", concept: "Performance", xp: 665, difficulty: 10, type: "build", lesson: "This mission practices Performance in a focused React scenario.", why: "Performance is a practical pattern you will use when building real React interfaces.", example: `React.memo`, starter: `const Card = ???(function Card(){ return <div>Card</div>; });`, task: "Memoize the child component.", answer: `React.memo`, hint: "Focus on the Performance pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 196, world: "ARCHITECTURE", title: "Lazy Component", concept: "Code splitting", xp: 675, difficulty: 10, type: "build", lesson: "This mission practices Code splitting in a focused React scenario.", why: "Code splitting is a practical pattern you will use when building real React interfaces.", example: `lazy(() => import("./Settings"))`, starter: `const Settings = ???;`, task: "Lazy-load the Settings component.", answer: `lazy(() => import("./Settings"))`, hint: "Focus on the Code splitting pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 197, world: "ARCHITECTURE", title: "Suspense Boundary", concept: "Async UI", xp: 685, difficulty: 10, type: "build", lesson: "This mission practices Async UI in a focused React scenario.", why: "Async UI is a practical pattern you will use when building real React interfaces.", example: `Suspense fallback={<p>Loading...</p>}`, starter: `function App(){ return <???><Settings /></Suspense>; }`, task: "Wrap lazy content in Suspense.", answer: `Suspense fallback={<p>Loading...</p>}`, hint: "Focus on the Async UI pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 198, world: "ARCHITECTURE", title: "Accessible Label", concept: "Accessibility", xp: 695, difficulty: 10, type: "build", lesson: "This mission practices Accessibility in a focused React scenario.", why: "Accessibility is a practical pattern you will use when building real React interfaces.", example: `aria-label="Close"`, starter: `function App(){ return <button ???>×</button>; }`, task: "Give the icon button an accessible name.", answer: `aria-label="Close"`, hint: "Focus on the Accessibility pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 199, world: "ARCHITECTURE", title: "Stable Identity", concept: "Keys", xp: 705, difficulty: 10, type: "build", lesson: "This mission practices Keys in a focused React scenario.", why: "Keys is a practical pattern you will use when building real React interfaces.", example: `key={item.id}`, starter: `items.map(item => <Row ??? item={item} />);`, task: "Use stable item identity for the key.", answer: `key={item.id}`, hint: "Focus on the Keys pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
  { id: 200, world: "ARCHITECTURE", title: "Capstone Status", concept: "Architecture", xp: 715, difficulty: 10, type: "build", lesson: "This mission practices Architecture in a focused React scenario.", why: "Architecture is a practical pattern you will use when building real React interfaces.", example: `const status = complete ? "DONE" : "IN PROGRESS"`, starter: `function Status({complete}){ ???; return <strong>{status}</strong>; }`, task: "Calculate a clear completion status.", answer: `const status = complete ? "DONE" : "IN PROGRESS"`, hint: "Focus on the Architecture pattern shown in the worked example.", hint2: "Make the smallest code change that satisfies the objective.", hint3: "Use the exact pattern shown in the example." },
];
missions.push(...expansionMissions200);

// Canonical mission set: exactly 200 unique missions.
// Difficulty 1 contains IDs 1-20, difficulty 2 contains 21-40, etc.
// This guarantees exactly 20 nodes per difficulty and prevents duplicate React keys.
missions.forEach(m => {
  m.difficulty = Math.floor((m.id - 1) / 20) + 1;
});

// Keep worked examples useful without turning them into answer keys.
// The exact challenge solution is deliberately hidden from the briefing and
// is revealed only as Hint 3. This keeps the game solvable without making
// every mission a copy/paste exercise.
for (const m of missions) {
  const answer = String(m.answer ?? "").trim();
  let example = String(m.example ?? "").trim();
  if (answer && example.includes(answer)) {
    example = example.split(answer).join("/* solution hidden — reveal Hint 3 if needed */");
  }
  if (!example || example === answer) {
    example = `Concept focus: ${m.concept}.\nUse the concept in a different context; the exact challenge syntax is intentionally hidden.`;
  }
  m.example = example;
  m.hint3 = `Need the exact pattern? Use this solution:\n${answer}`;
}

function getCookie(name) {
  try {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  } catch { return ""; }
}
function setResumeCookie(id) {
  try { document.cookie = `rq-resume-level=${encodeURIComponent(String(id))}; path=/; max-age=31536000; SameSite=Lax`; } catch { }
}
function clearResumeCookie() {
  try { document.cookie = "rq-resume-level=; path=/; max-age=0; SameSite=Lax"; } catch { }
}
function readResumeLevel() {
  const candidates = [];
  try { candidates.push(localStorage.getItem("rq-resume-level")); } catch { }
  try { candidates.push(localStorage.getItem("rq-current")); } catch { }
  try { candidates.push(sessionStorage.getItem("rq-resume-level")); } catch { }
  candidates.push(getCookie("rq-resume-level"));
  try {
    const hash = window.location.hash.match(/^#mission-(\d+)$/);
    if (hash) candidates.push(hash[1]);
  } catch { }
  for (const raw of candidates) {
    const id = Number(raw);
    if (Number.isInteger(id) && id >= 1 && id <= 200) return id;
  }
  return 1;
}
function persistResumeLevel(id) {
  const value = String(id);
  safeSet("rq-resume-level", value);
  safeSet("rq-current", value);
  try { sessionStorage.setItem("rq-resume-level", value); } catch { }
  setResumeCookie(id);
  try { window.history.replaceState(null, "", `#mission-${id}`); } catch { }
}

const gauntletOrder = Array.from({ length: 200 }, (_, i) => i + 1);

const worlds = [
  ["FOUNDATIONS", "Components, JSX & the mental model"],
  ["PROPS", "Passing data between components"],
  ["EVENTS", "Making interfaces react to users"],
  ["STATE", "Giving components memory"],
  ["RENDERING", "Conditions and dynamic UI"],
  ["LISTS", "Arrays, maps and keys"],
  ["FORMS", "Controlled inputs and submissions"],
  ["EFFECTS", "Synchronizing with external systems"],
  ["HOOKS", "Reusable stateful logic"],
  ["CONTEXT", "Shared values across a tree"],
  ["REDUCER", "Complex state transitions"],
  ["PERFORMANCE", "Memoization and optimization"],
  ["ASYNC", "Data fetching, async UI & race conditions"],
  ["ARCHITECTURE", "Reusable patterns and scalable component design"],
  ["TESTING", "Component behavior, tests and debugging"],
  ["ECOSYSTEM", "Routing, server state and modern React tooling"],
  ["CAPSTONE", "Real-world React systems and architecture"]
];

function stripCodeComments(source) {
  return String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .trim();
}

// Mission validation is deliberately separate from compilation. Babel answers
// "is this valid JavaScript/JSX?"; this answers "did the learner satisfy the
// actual objective?". A syntactically valid but incomplete answer must never
// be reported as a successful mission.
function validateMission(code, mission) {
  const raw = String(code || "");
  const clean = stripCodeComments(raw);
  const normalized = clean.replace(/\s+/g, " ").trim();
  const target = String(mission?.answer || "").replace(/\s+/g, " ").trim();
  let passed = !!target && normalized.includes(target);

  const has = (...parts) => parts.every(part => clean.includes(part));
  const hasEither = (...parts) => parts.some(part => clean.includes(part));

  switch (mission?.id) {
    case 1: passed = clean.includes("ReactQuest"); break;
    case 2: passed = clean.includes("{hero}"); break;
    case 3: passed = clean.includes("<Badge"); break;
    case 4: passed = clean.includes("{name}"); break;
    case 5: passed = clean.includes("props.score"); break;
    case 6: passed = has("onClick={launch}") && !clean.includes("onClick={launch()}"); break;
    case 7: passed = has("setCount(count + 1)", "onClick"); break;
    case 8: passed = clean.includes("setOn(!on)"); break;
    case 9: passed = has("setUser", "...user", "user.level + 1"); break;
    case 10: passed = has("setItems", "...items", "🔥"); break;
    case 11: passed = has("unlocked &&", "UNLOCKED"); break;
    case 12: passed = has("online ?", "OFFLINE"); break;
    case 13: passed = has("skills.map", "key="); break;
    case 14: passed = clean.includes("key={q.id}"); break;
    case 15: passed = has("value={name}", "setName(e.target.value)"); break;
    case 16: passed = clean.includes("e.preventDefault()"); break;
    case 17: passed = has("console.log", "[]"); break;
    case 18: passed = clean.includes("return () => clearInterval(id)"); break;
    case 19: passed = clean.includes("return value * 2"); break;
    case 20: passed = clean.includes("<span>light</span>"); break;
    case 21: passed = has("action.type === 'inc'", "state + 1") || has("action.type === \"inc\"", "state + 1"); break;
    case 22: passed = clean.includes("return items.length"); break;
    case 23: passed = has("<>", "</>"); break;
    case 24: passed = clean.includes("onClick={onSave}") && !clean.includes("onClick={onSave()}"); break;
    case 25: passed = hasEither('label = "READY"', "label = 'READY'"); break;
    case 26: passed = clean.includes("e.target.value"); break;
    case 27: passed = hasEither('e.key === "Enter"', "e.key === 'Enter'"); break;
    case 28: passed = clean.includes("e.stopPropagation()"); break;
    case 29: passed = clean.includes("return null"); break;
    case 30: passed = clean.includes("<p>Log in</p>"); break;
    case 31: passed = has("quests.filter(q => q.done).map", "key={q.id}"); break;
    case 32: passed = clean.includes("key={task.id}") && !clean.includes("key={index}"); break;
    case 33: passed = has("value={note}", "setNote(e.target.value)"); break;
    case 34: passed = has("checked={done}", "setDone(e.target.checked)"); break;
    case 35: passed = clean.includes("[query]"); break;
    case 36: passed = clean.includes("return () => clearInterval(id)"); break;
    case 37: passed = clean.includes("ref={inputRef}"); break;
    case 38: passed = has("useCallback", 'console.log("saved")'); break;
    case 39: passed = clean.includes("const [count, setCount] = useState(0)") && clean.indexOf("useState(0)") < clean.indexOf("if (open)"); break;
    case 40: passed = clean.includes("useContext(ThemeContext)"); break;
    case 41: passed = hasEither('value="neon"', "value='neon'"); break;
    case 42: passed = hasEither('createContext("en")', "createContext('en')"); break;
    case 43: passed = clean.includes("action.payload"); break;
    case 44: passed = hasEither('action.type === "reset"', "action.type === 'reset'") && clean.includes("return 0"); break;
    case 45: passed = hasEither('case "inc":', "case 'inc':") && clean.includes("return state + 1"); break;
    case 46: passed = clean.includes("price * qty"); break;
    case 47: passed = clean.includes("React.memo"); break;
    case 48: passed = clean.includes("[price, qty]"); break;
    default:
      // For the later generated missions, the answer field is the objective.
      // Exact-ish matching is intentionally conservative and comment-free.
      passed = !!target && normalized.includes(target);
  }

  return !!passed;
}

function App() {
  // Resume exactly where the learner last stopped. The current mission is
  // intentionally independent from the solved list: an unfinished level stays
  // the default level after a refresh/reopen.
  const [current, setCurrent] = useState(() => {
    const saved = readResumeLevel();
    return missions.some(m => m.id === saved) ? saved : 1;
  });
  const [drafts, setDrafts] = useState(() => { try { return JSON.parse(safeGet("rq-drafts", "{}")); } catch (e) { return {}; } });
  const initialMissionId = readResumeLevel();
  const initialMission = missions.find(m => m.id === initialMissionId) || missions[0];
  const [code, setCode] = useState(() => drafts[initialMission.id] || initialMission.starter);
  const [live, setLive] = useState(() => {
    const initialCode = drafts[initialMission.id] || initialMission.starter;
    return { ...compileLive(initialCode), objectivePassed: validateMission(initialCode, initialMission) };
  });
  const [previewLogs, setPreviewLogs] = useState([]);
  const [solved, setSolved] = useState(() => { try { return [...new Set(JSON.parse(safeGet("rq-solved", "[]")))].filter(id => Number.isInteger(id) && id >= 1 && id <= 200); } catch { return []; } });
  const [xp, setXp] = useState(() => Number(safeGet("rq-xp", "0")));
  const [streak, setStreak] = useState(() => Number(safeGet("rq-streak", "0")));
  const [message, setMessage] = useState("");
  const [hints, setHints] = useState(0);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("mission");
  const [page, setPage] = useState("mission");
  const [profileName, setProfileName] = useState(() => safeGet("rq-profile-name", "React Cadet"));
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [missionFilter, setMissionFilter] = useState("ALL");
  // Keep the difficulty map synced with the exact mission we resume.
  // Previously this defaulted to Difficulty 1 even when `current` was a
  // saved mission such as #48 (Difficulty 3), so refresh showed the wrong
  // world map while the mission itself was still restored correctly.
  const [selectedDifficulty, setSelectedDifficulty] = useState(() => {
    const resumeMission = missions.find(m => m.id === current);
    return resumeMission?.difficulty || 1;
  });
  const [difficultyMenuOpen, setDifficultyMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [saveState, setSaveState] = useState("Saved");
  const [sandboxCode, setSandboxCode] = useState(() => safeGet("rq-sandbox-code", `function App() {\n  return <div>\n    <h1>Hello, React!</h1>\n    <p>Test your code here.</p>\n  </div>;\n}`));
  const [sandboxLive, setSandboxLive] = useState(() => compileLive(safeGet("rq-sandbox-code", `function App() {\n  return <div>\n    <h1>Hello, React!</h1>\n    <p>Test your code here.</p>\n  </div>;\n}`)));
  const [sandboxLogs, setSandboxLogs] = useState([]);
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const editorRef = useRef(null);
  const sandboxEditorRef = useRef(null);
  const runMissionRef = useRef(null);

  const mission = missions.find(m => m.id === current);
  const solvedSet = useMemo(() => new Set(solved), [solved]);
  const level = Math.floor(xp / 500) + 1;
  const progress = Math.min(100, Math.round((solved.length / missions.length) * 100));

  useEffect(() => {
    // The current mission is the resume point. Keep the visible difficulty
    // world synchronized with it after navigation as well as after refresh.
    if (mission?.difficulty && selectedDifficulty !== mission.difficulty) {
      setSelectedDifficulty(mission.difficulty);
    }
  }, [current, mission?.difficulty]);

  useEffect(() => {
    // Persist the exact mission immediately and redundantly so refresh/reopen
    // returns to the last level, even if one browser storage mechanism is
    // unavailable. The current level is the resume point, not the last cleared level.
    persistResumeLevel(current);
  }, [current]);

  useEffect(() => {
    safeSet("rq-profile-name", profileName || "React Cadet");
  }, [profileName]);

  const addPreviewLog = useCallback((kind, text) => {
    setPreviewLogs(prev => [...prev.slice(-19), { kind, text }]);
  }, []);

  useEffect(() => {
    setPreviewLogs([]);
    const timer = setTimeout(() => {
      const result = compileLive(code, addPreviewLog);
      setLive({ ...result, objectivePassed: validateMission(code, mission) });
    }, 350);
    return () => clearTimeout(timer);
  }, [code, current]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
        setRightOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function updateCode(id, value) {
    setCode(value);
    setSaveState("Saving…");
    setDrafts(prev => {
      const next = { ...prev, [id]: value };
      safeSet("rq-drafts", JSON.stringify(next));
      return next;
    });
    window.clearTimeout(window.__rqSaveTimer);
    window.__rqSaveTimer = window.setTimeout(() => setSaveState("Saved"), 250);
  }

  function loadMission(id) {
    const m = missions.find(x => x.id === id);
    if (!m) return;
    setCurrent(id); setSelectedDifficulty(m.difficulty); setCode(drafts[id] || m.starter); setMessage(""); setHints(0); setTab("mission"); setPage("mission");
    persistResumeLevel(id);
    setSidebarOpen(false); setRightOpen(false);
  }

  runMissionRef.current = runMission;

  function resetCode() {
    const next = mission.starter;
    updateCode(current, next);
    // The mission editor is intentionally uncontrolled while typing, so
    // update its buffer explicitly for Reset instead of feeding `value` on
    // every keystroke.
    editorRef.current?.setValue(next);
  }

  function runMission() {
    setRunning(true);
    setTimeout(() => {
      // Mission validation and the Live Preview now use the same compiler.
      // A mission cannot report a successful clear while its code fails to
      // compile, which prevents the confusing CLEAR + ERROR state.
      const compiledNow = compileLive(code, addPreviewLog);
      setLive({ ...compiledNow, objectivePassed: validateMission(code, mission) });
      const passed = validateMission(code, mission);

      if (compiledNow.error) {
        setMessage(`Syntax error: ${compiledNow.error}`);
        setStreak(0);
        safeSet("rq-streak", "0");
      } else if (passed) {
        if (!solvedSet.has(mission.id)) {
          const earned = Math.max(25, mission.xp - hints * 25);
          const nextSolved = [...solved, mission.id];
          const nextXp = xp + earned;
          const nextStreak = streak + 1;
          setSolved(nextSolved);
          setXp(nextXp);
          setStreak(nextStreak);
          safeSet("rq-solved", JSON.stringify(nextSolved));
          safeSet("rq-xp", String(nextXp));
          safeSet("rq-streak", String(nextStreak));
          setMessage(`MISSION CLEAR! +${earned} XP`);
        } else {
          // A cleared mission is still fully replayable. Keep the success state
          // so the Next Mission action remains available after a replay.
          setMessage("MISSION ALREADY CLEARED. Keep experimenting!");
        }
      } else {
        setMessage(compiledNow.error ? `Syntax error: ${compiledNow.error}` : "Not quite. Run it again or use a hint.");
        setStreak(0);
        safeSet("rq-streak", "0");
      }
      setRunning(false);
    }, 350);
  }

  function getNextAvailableMission() {
    // Next Mission follows the canonical 200-level Gauntlet order, not raw
    // mission ids. This keeps Difficulty N/10 -> Difficulty N+1/1 correct.
    const position = gauntletOrder.indexOf(current);
    if (position < 0 || position >= gauntletOrder.length - 1) return null;
    const next = missions.find(m => m.id === gauntletOrder[position + 1]);
    return next && isMissionUnlocked(next.id) ? next : null;
  }

  function nextMission() {
    const next = getNextAvailableMission();
    if (next) loadMission(next.id);
  }

  function worldMissions(worldName) {
    return missions.filter(m => m.world === worldName);
  }

  function worldProgress(worldName) {
    const list = worldMissions(worldName);
    const cleared = list.filter(m => solvedSet.has(m.id)).length;
    return { cleared, total: list.length, percent: list.length ? Math.round((cleared / list.length) * 100) : 0 };
  }

  // The 200-level Gauntlet is the canonical progression system.
  // Missions are arranged by gauntletOrder so each difficulty has exactly 20 nodes.
  // Keep every lock indicator and every navigation path on the same rule:
  // a mission is playable when its difficulty world is unlocked and the
  // previous node in that difficulty is cleared. Concept/world groupings
  // (HOOKS, FORMS, etc.) are labels, not a second progression system.
  function isMissionUnlocked(id) {
    const m = missions.find(x => x.id === id);
    if (!m) return false;
    const list = difficultyMissions(m.difficulty);
    const index = list.findIndex(x => x.id === id);
    return isDifficultyMissionUnlocked(m.difficulty, index);
  }

  // A concept world is considered open when at least one of its missions
  // is playable in the Gauntlet. This prevents the sidebar/Mission Select
  // from saying a mission is locked while the same mission is playable from
  // the Difficulty map.
  function isWorldUnlocked(worldName) {
    return worldMissions(worldName).some(m => isMissionUnlocked(m.id));
  }

  function difficultyMissions(level) {
    return missions.filter(m => m.difficulty === level).sort((a, b) => gauntletOrder.indexOf(a.id) - gauntletOrder.indexOf(b.id));
  }

  function difficultyProgress(level) {
    const list = difficultyMissions(level);
    const cleared = list.filter(m => solvedSet.has(m.id)).length;
    return { cleared, total: list.length, percent: list.length ? Math.round(cleared / list.length * 100) : 0 };
  }

  function isDifficultyUnlocked(level) {
    if (level <= 1) return true;
    const previous = difficultyProgress(level - 1);
    return previous.cleared === previous.total;
  }

  function isDifficultyMissionUnlocked(level, index) {
    if (!isDifficultyUnlocked(level)) return false;
    const list = difficultyMissions(level);
    if (index <= 0) return true;
    return solvedSet.has(list[index - 1].id);
  }

  function loadDifficultyMission(id, level, index) {
    if (!isDifficultyMissionUnlocked(level, index)) {
      setMessage(`🔒 Clear the previous node on Difficulty ${level} to unlock this mission.`);
      return;
    }
    loadMission(id);
    setSelectedDifficulty(level);
  }

  function tryLoadMission(id) {
    const m = missions.find(x => x.id === id);
    if (!m) return;
    if (!isMissionUnlocked(id)) {
      setMessage(`🔒 Mission ${id} is locked. Clear the previous challenge to unlock it.`);
      return;
    }
    loadMission(id);
  }

  function openProfile() {
    setPage("profile");
    setSidebarOpen(false);
    setRightOpen(false);
  }

  function openSettings() {
    setPage("settings");
    setSidebarOpen(false);
    setRightOpen(false);
  }

  function openSandbox() {
    setPage("sandbox");
    setSidebarOpen(false);
    setRightOpen(false);
  }

  function runSandbox() {
    setSandboxRunning(true);
    setSandboxLogs([]);
    const logs = [];
    const logger = (kind, text) => {
      const item = { kind, text };
      logs.push(item);
      setSandboxLogs(prev => [...prev.slice(-29), item]);
    };
    const result = compileLive(sandboxCode, logger);
    setSandboxLogs(logs.slice(-30));
    setSandboxLive(result);
    setSandboxRunning(false);
    safeSet("rq-sandbox-code", sandboxCode);
  }

  function resetGame() {
    if (resetText.trim().toUpperCase() !== "CONFIRM") return;
    safeSet("rq-drafts", "{}");
    safeSet("rq-solved", "[]");
    safeSet("rq-xp", "0");
    safeSet("rq-streak", "0");
    safeSet("rq-resume-level", "1");
    safeSet("rq-current", "1");
    try { sessionStorage.setItem("rq-resume-level", "1"); } catch { }
    clearResumeCookie();
    try { window.history.replaceState(null, "", "#mission-1"); } catch { }
    setDrafts({});
    setSolved([]);
    setXp(0);
    setStreak(0);
    setCurrent(1);
    setCode(missions[0].starter);
    setLive({ ...compileLive(missions[0].starter), objectivePassed: validateMission(missions[0].starter, missions[0]) });
    setMessage("");
    setHints(0);
    setTab("mission");
    setSelectedDifficulty(1);
    setPage("mission");
    setResetText("");
    setResetOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="nav-toggles">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar" title="Open sidebar">💻</button>
        </div>
        <div className="brand"><div className="logo">💻</div><div><b>REACT<span>QUEST</span></b><small>LEARN • DEBUG • BUILD</small></div></div>
        <div className="top-stats">
          <div className="stat"><span className="ico">🔥</span><b>{streak}</b><small>STREAK</small></div>
          <div className="stat"><span className="ico">⚡</span><b>{xp.toLocaleString()}</b><small>XP</small></div>
          <div className="level"><span>LVL {level}</span><div className="bar"><i style={{ width: `${(xp % 500) / 5}%` }} /></div></div>
          <button className="menu-btn" onClick={openSettings} aria-label="Open settings" title="Settings">⚙️</button>
          <button className="menu-btn" onClick={openSandbox} aria-label="Open code sandbox" title="Code Sandbox">🧪</button>
          <button className="menu-btn" onClick={() => setRightOpen(true)} aria-label="Open missions" title="Missions">🏆</button>
        </div>
      </header>
      {(sidebarOpen || rightOpen) && <div className="nav-backdrop" onClick={() => { setSidebarOpen(false); setRightOpen(false); }} />}

      {page === "mission" ? <main className="layout">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <button className="drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close">✕</button>
          <div className="side-title"><span className="ico">🎮</span> WORLD MAP</div>
          {worlds.map(([name, desc], wi) => {
            const first = worldMissions(name).find(m => isMissionUnlocked(m.id));
            const unlocked = isWorldUnlocked(name);
            const wp = worldProgress(name);
            return <button key={name} className={`world ${current && mission.world === name ? "active" : ""} ${!unlocked ? "locked" : ""}`} onClick={() => unlocked && first && tryLoadMission(first.id)}>
              <div className="world-icon">{wp.cleared === wp.total && wp.total ? "✅" : unlocked ? <span>{String(wi + 1).padStart(2, "0")}</span> : "🔒"}</div>
              <div className="world-copy"><b>{name}</b><small>{desc}</small><span className="world-progress-mini">{wp.cleared}/{wp.total} CLEARED</span></div><span className="chev">›</span>
            </button>
          })}
          <div className="progress-card"><div className="progress-head"><span>QUEST PROGRESS</span><b>{progress}%</b></div><div className="bar"><i style={{ width: `${progress}%` }} /></div><small>{solved.length}/{missions.length} missions cleared</small></div>
        </aside>

        <section className="center">
          <div className="breadcrumb">
            <span>WORLD {worlds.findIndex(w => w[0] === mission.world) + 1}</span><span>›</span>
            <span>{mission.world}</span><span>›</span><b>MISSION {mission.id}</b>
            <span style={{ marginLeft: "auto", color: "#42d9ff" }}>{solved.length}/{missions.length} CLEARED</span>
          </div>
          <section className="difficulty-map">
            <div className="difficulty-map-head">
              <div><span className="map-kicker">🧭 DIFFICULTY WORLD MAP</span><b>THE REACT GAUNTLET</b><small>10 difficulty worlds · 20 missions each · 200 total levels</small></div>
              <div className="difficulty-total">{solved.length}/200 <span>cleared</span></div>
            </div>
            <div className="difficulty-selector">
              {(() => {
                const dp = difficultyProgress(selectedDifficulty);
                const unlocked = isDifficultyUnlocked(selectedDifficulty);
                return <button
                  type="button"
                  className={`difficulty-dropdown-trigger ${!unlocked ? "locked" : ""}`}
                  onClick={() => setDifficultyMenuOpen(v => !v)}
                  aria-expanded={difficultyMenuOpen}
                  aria-controls="difficulty-dropdown-menu"
                >
                  <span className="difficulty-badge">{selectedDifficulty}</span>
                  <span className="difficulty-trigger-copy"><b>DIFFICULTY {selectedDifficulty}</b><small>{dp.cleared}/20 cleared</small></span>
                  <i>{difficultyMenuOpen ? " " : " "}</i>
                </button>;
              })()}
              <div id="difficulty-dropdown-menu" className={`difficulty-worlds ${difficultyMenuOpen ? "open" : ""}`}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(level => {
                  const dp = difficultyProgress(level);
                  const unlocked = isDifficultyUnlocked(level);
                  return <button key={level} type="button" className={`difficulty-world ${selectedDifficulty === level ? "active" : ""} ${!unlocked ? "locked" : ""}`} onClick={() => { if (unlocked) { setSelectedDifficulty(level); setDifficultyMenuOpen(false); } }}>
                    <span className="difficulty-badge">{level}</span><div><b>DIFFICULTY {level}</b><small>{dp.cleared}/20 cleared</small></div><i>{dp.cleared === 20 ? "✓" : unlocked ? "›" : "🔒"}</i>
                  </button>;
                })}
              </div>
            </div>
            <div className="level-path">
              {difficultyMissions(selectedDifficulty).map((m, index) => {
                const unlocked = isDifficultyMissionUnlocked(selectedDifficulty, index);
                const done = solvedSet.has(m.id);
                return <button key={m.id} className={`path-node ${done ? "done" : ""} ${current === m.id ? "current" : ""} ${!unlocked ? "locked" : ""}`} onClick={() => loadDifficultyMission(m.id, selectedDifficulty, index)} title={`${m.title} · ${m.xp} XP`}>
                  <span>{done ? "✓" : unlocked ? index + 1 : "🔒"}</span><small>{m.type === "debug" ? "🐛" : "⚛"}</small>
                </button>;
              })}
            </div>
          </section>

          <div className="mission-head">
            <div><div className="eyebrow">{mission.type === "debug" ? <>🐛 DEBUG MISSION</> : <>🖥️ BUILD MISSION</>} • {mission.concept}</div><h1>{mission.title}</h1><p>{mission.lesson}</p></div>
            <div className="mission-xp"><span className="ico">⚡</span><b>+{mission.xp}</b><small>XP</small></div>
          </div>

          <div className="tabs"><button className={tab === "mission" ? "on" : ""} onClick={() => setTab("mission")}>📖 Briefing</button><button className={tab === "hints" ? "on" : ""} onClick={() => setTab("hints")}>💡 Hints {hints ? `(${hints})` : ""}</button></div>

          {tab === "mission" ? <div className="briefing">
            <div className="objective"><span className="ico">🧠</span><div><b>WHY IT MATTERS</b><p>{mission.why}</p></div></div>
            <div className="objective" style={{ marginTop: 9 }}><span className="ico">📄</span><div style={{ width: "100%" }}><b>WORKED EXAMPLE • ANSWER HIDDEN</b><pre style={{ margin: "7px 0 0", fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 11, color: "#9fd6ff", background: "#0a1120", border: "1px solid #1c2942", borderRadius: 7, padding: "9px 11px", overflowX: "auto", whiteSpace: "pre" }}>{mission.example}</pre><small style={{ display: "block", marginTop: 6, color: "#5f6c85", fontSize: 9 }}>A related concept is shown, but the exact challenge solution is hidden. Reveal Hints when you need a nudge; Hint 3 contains the exact solution.</small></div></div>
            <div className="objective" style={{ marginTop: 9 }}><span className="ico">✨</span><div><b>OBJECTIVE</b><p>{mission.task}</p></div></div>
            <div className="tip" style={{ marginTop: 9 }}><span className="ico">📊</span><span>Difficulty</span><b>{"◆".repeat(mission.difficulty)}<i>{"◇".repeat(10 - mission.difficulty)}</i></b></div>
          </div> :
            <div className="hint-panel"><span className="ico">💡</span><div style={{ width: "100%" }}>
              {[mission.hint, mission.hint2, mission.hint3].slice(0, hints + 1).map((h, i) => (
                <div className="hint-item" key={i}><b>HINT {i + 1} OF 3</b><p>{h}</p></div>
              ))}
              {hints < 2 && <button onClick={() => setHints(Math.min(2, hints + 1))}>Reveal Next Hint</button>}
              {hints >= 2 && <small style={{ display: "block", marginTop: 6, color: "#766b95", fontSize: 9, letterSpacing: 1 }}>All hints revealed for this mission.</small>}
            </div></div>}

          <div className="workspace">
            <div className="editor-panel">
              <div className="panel-head">
                <span>💻 challenge.jsx</span>
                <span title="Your code is saved in this browser">{saveState} · <span className="dot">● LIVE</span></span>
              </div>
              <div className="monaco-editor-wrap">
                <Editor
                  key={`mission-editor-${current}`}
                  height="100%"
                  language="javascript"
                  theme="vs-dark"
                  // Keep Monaco uncontrolled while typing. A controlled `value`
                  // prop makes ReactQuest push the whole buffer back into Monaco
                  // after every keystroke, which can reset the cursor/selection
                  // and makes the caret appear to jump to another position.
                  defaultValue={code}
                  onChange={(value) => updateCode(current, value ?? "")}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    editor.addAction({
                      id: "reactquest-run",
                      label: "Run Mission",
                      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                      run: () => runMissionRef.current && runMissionRef.current()
                    });
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 15,
                    lineHeight: 23,
                    fontLigatures: true,
                    automaticLayout: true,
                    wordWrap: "on",
                    tabSize: 2,
                    insertSpaces: true,
                    folding: true,
                    bracketPairColorization: { enabled: true },
                    smoothScrolling: true,
                    padding: { top: 14, bottom: 14 },
                    scrollBeyondLastLine: false,
                    // Suggestions must never interfere with ordinary typing.
                    // Learners can still open IntelliSense manually with Ctrl+Space.
                    suggestOnTriggerCharacters: false,
                    quickSuggestions: false,
                    // Do not let Enter/Space silently accept the currently
                    // highlighted autocomplete item. This was causing text
                    // such as `name={user.name}` to be split/committed while
                    // the learner was simply trying to type a space or newline.
                    acceptSuggestionOnEnter: "off",
                    acceptSuggestionOnCommitCharacter: false,
                    suggest: {
                      showMethods: true,
                      showFunctions: true,
                      showConstructors: true,
                      showDeprecated: true,
                      showFields: true,
                      showVariables: true,
                      showClasses: true,
                      showStructs: true,
                      showInterfaces: true,
                      showModules: true,
                      showProperties: true,
                      showEvents: true,
                      showOperators: true,
                      showUnits: true,
                      showValues: true,
                      showConstants: true,
                      showEnums: true,
                      showEnumMembers: true,
                      showKeywords: true,
                      showWords: true
                    },
                    formatOnPaste: false,
                    formatOnType: false,
                    cursorBlinking: "smooth",
                    renderWhitespace: "selection",
                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                    overviewRulerLanes: 0,
                    contextmenu: true
                  }}
                />
              </div>
              <div className="editor-actions">
                <span className="kbd-hint">⌘/Ctrl + Enter to run · Esc closes menus</span>
                <button className="secondary" onClick={() => editorRef.current?.getAction("editor.action.formatDocument")?.run()} disabled={running}>✨ Format</button>
                <button className="secondary" onClick={resetCode} disabled={running}>↺ Reset</button>
                <button className="run" onClick={runMission} disabled={running}>▶ {running ? "Checking…" : "Run Mission"}</button>
              </div>
              {message && <div className={`result ${message.startsWith("MISSION") ? "success" : "fail"}`}>
                <span>{message.startsWith("MISSION") ? "✅" : "❌"}</span>
                <b>{message}</b>
                {message.startsWith("MISSION") && getNextAvailableMission() && <button onClick={nextMission}>Next Mission ›</button>}
                {!message.startsWith("MISSION") && <button onClick={() => setTab("hints")}>💡 Hints</button>}
              </div>}
            </div>

            <div className="preview-panel">
              <div className="panel-head"><span>▶ LIVE PREVIEW</span><span className="preview-live">{live.error ? "● ERROR" : live.fragment && live.objectivePassed === false ? "● OBJECTIVE ERROR" : live.Comp ? "● LIVE" : live.fragment ? "● COMPILED" : "● SANDBOX"}</span></div>
              <div className="preview">
                <div className="scanlines" />
                {live.Comp ? (
                  <div className="live-wrap">
                    <PreviewBoundary key={code} resetKey={code}>
                      <PreviewRuntime Comp={live.Comp} />
                    </PreviewBoundary>
                  </div>
                ) : live.error ? (
                  <div className="preview-error"><span className="ico">⚠️</span><b>Won't compile yet</b><small>{live.error}</small><span className="preview-error-note">Fix the code to see the real React output here.</span></div>
                ) : live.fragment && live.objectivePassed === false ? (
                  <div className="preview-card preview-objective-error"><div className="react-mark">⚠️</div><b>OBJECTIVE NOT MET</b><small>The JavaScript is syntactically valid, but it does not satisfy this mission's required answer yet.</small><span className="preview-error-note">Use the mission task or hints to make the required change. Valid syntax alone does not clear a mission.</span></div>
                ) : live.fragment ? (
                  <div className="preview-card"><div className="react-mark">✓</div><b>CODE COMPILED</b><small>{live.fragmentMessage}</small><span className="preview-error-note">When a mission defines an App component, its real UI appears here.</span></div>
                ) : (
                  <div className="preview-card"><div className="react-mark">⚛</div><b>WAITING FOR REACT CODE</b><small>Complete a valid App component and the compiled UI will appear here automatically.</small></div>
                )}
              </div>
              <div className="console">
                <div className="console-head"><span>🖥️ CONSOLE</span><button type="button" onClick={() => setPreviewLogs([])}>Clear</button></div>
                {previewLogs.length ? previewLogs.map((item, i) => <div className={`console-line ${item.kind}`} key={i}><b>{item.kind}</b><span>{item.text}</span></div>) : <span className="console-empty">Your console output will appear here when your compiled React app logs something.</span>}
              </div>
            </div>
          </div>
        </section>

        <aside className={`rightbar ${rightOpen ? "open" : ""}`}>
          <button className="drawer-close" onClick={() => setRightOpen(false)} aria-label="Close">✕</button>
          <button type="button" className="card loadout-card" onClick={openProfile} aria-label="Open player profile">
            <div className="card-title"><span className="ico">🏆</span> YOUR LOADOUT <span className="card-arrow">›</span></div>
            <div className="rank"><div className="rank-icon">🛡</div><div><b>{profileName || "React Cadet"}</b><small>Level {level} learner</small></div></div>
            <div className="mini-stat"><span>XP</span><b>{xp.toLocaleString()}</b></div>
            <div className="mini-stat"><span>MISSIONS</span><b>{solved.length}/{missions.length}</b></div>
            <small className="loadout-open">Open profile ›</small>
          </button>
          <div className="card">
            <div className="card-title"><span className="ico">👑</span> ACHIEVEMENTS</div>
            <Achievement icon="⚛️" title="First Render" done={solved.length >= 1} />
            <Achievement icon="🐛" title="Bug Hunter" done={solved.filter(id => missions.find(m => m.id === id)?.type === "debug").length >= 3} />
            <Achievement icon="⚡" title="State Hacker" done={solved.filter(id => [7, 8, 9, 10].includes(id)).length >= 4} />
            <Achievement icon="👑" title="React Architect" done={solved.length === missions.length} />
          </div>
          <div className="card challenge-list mission-hub">
            <div className="card-title"><span className="ico">✨</span> MISSION SELECT <small className="mission-count">{solved.length}/{missions.length}</small></div>
            <div className="mission-filters">
              {["ALL", "BUILD", "DEBUG"].map(filter => <button key={filter} className={`filter-chip ${missionFilter === filter ? "on" : ""}`} onClick={() => setMissionFilter(filter)}>{filter}</button>)}
              <button className="filter-chip" onClick={() => setSelectedDifficulty(Math.min(10, selectedDifficulty + 1))}>NEXT DIFF ›</button>
            </div>
            {worlds.map(([name]) => {
              const wp = worldProgress(name);
              const list = worldMissions(name).filter(m => missionFilter === "ALL" || m.type.toUpperCase() === missionFilter);
              if (!list.length) return null;
              const unlocked = isWorldUnlocked(name);
              return <div className="mission-group" key={name}>
                <div className="mission-group-head"><b>{name}</b><span>{wp.cleared}/{wp.total}</span></div>
                {list.map(m => {
                  const mUnlocked = isMissionUnlocked(m.id);
                  return <button key={m.id} className={`${current === m.id ? "selected" : ""} ${!mUnlocked ? "locked" : ""}`} onClick={() => tryLoadMission(m.id)}>
                    <span className={solvedSet.has(m.id) ? "done" : ""}>{solvedSet.has(m.id) ? "✓" : mUnlocked ? m.id : "🔒"}</span>
                    <div><b>{m.title}</b><small>{m.concept} · {m.type.toUpperCase()} · {m.xp} XP</small></div>
                  </button>
                })}
                {!unlocked && <div className="mission-locked-note">🔒 Complete the earlier Gauntlet missions to unlock this group.</div>}
              </div>;
            })}
          </div>
        </aside>
      </main> : page === "sandbox" ? (
        <main className="single-page sandbox-page">
          <section className="sandbox-shell">
            <div className="profile-hero sandbox-hero">
              <div className="profile-avatar">🧪</div>
              <div>
                <span className="eyebrow">CODE SANDBOX</span>
                <h1>React Code Sandbox</h1>
                <p>Experiment freely. This playground does not affect your mission progress or completion.</p>
              </div>
            </div>
            <div className="sandbox-grid">
              <div className="editor-panel sandbox-editor-panel">
                <div className="panel-head"><span>⌘ TEST CODE</span><span className="preview-live">LOCAL</span></div>
                <div className="monaco-editor-wrap sandbox-monaco">
                  <Editor
                    height="100%"
                    language="javascript"
                    theme="vs-dark"
                    defaultValue={sandboxCode}
                    onChange={(value) => { const v = value ?? ""; setSandboxCode(v); safeSet("rq-sandbox-code", v); }}
                    onMount={(editor) => { sandboxEditorRef.current = editor; }}
                    options={{
                      fontSize: 14,
                      minimap: { enabled: false },
                      wordWrap: "on",
                      automaticLayout: true,
                      padding: { top: 14 },
                      tabSize: 2,
                      scrollBeyondLastLine: false,
                      // Do not open/commit suggestions while the learner is
                      // simply typing. Ctrl+Space can still open IntelliSense.
                      quickSuggestions: false,
                      suggestOnTriggerCharacters: false,
                      // Keep Space/Enter as normal typing keys instead of
                      // accepting an autocomplete item by accident.
                      acceptSuggestionOnEnter: "off",
                      acceptSuggestionOnCommitCharacter: false
                    }}
                  />
                </div>
                <div className="editor-actions">
                  <button className="secondary" onClick={() => { const sample = `function App() {\n  return <div>\n    <h1>ReactQuest Sandbox</h1>\n    <button onClick={() => console.log("It works!")}>Test me</button>\n  </div>;\n}`; setSandboxCode(sample); safeSet("rq-sandbox-code", sample); sandboxEditorRef.current?.setValue(sample); }} type="button">↺ Example</button>
                  <button className="run" onClick={runSandbox} disabled={sandboxRunning}>▶ {sandboxRunning ? "Compiling…" : "Run Code"}</button>
                </div>
              </div>
              <div className="preview-panel sandbox-preview-panel">
                <div className="panel-head"><span>▶ OUTPUT</span><span className="preview-live">{sandboxLive.error ? "● ERROR" : sandboxLive.Comp ? "● LIVE" : sandboxLive.fragment ? "● COMPILED" : "● READY"}</span></div>
                <div className="preview sandbox-preview">
                  {sandboxLive.error ? (
                    <div className="preview-error"><span className="ico">⚠️</span><b>Won't compile</b><small>{sandboxLive.error}</small><span className="preview-error-note">Fix the code and run it again.</span></div>
                  ) : sandboxLive.Comp ? (
                    <div className="live-wrap"><span className="live-output-badge">REAL REACT OUTPUT</span><PreviewBoundary resetKey={sandboxCode}><PreviewRuntime Comp={sandboxLive.Comp} /></PreviewBoundary></div>
                  ) : (
                    <div className="preview-card"><div className="react-mark">✓</div><b>CODE COMPILED</b><small>{sandboxLive.fragmentMessage || "Your code is ready to run."}</small></div>
                  )}
                </div>
                <div className="console sandbox-console">
                  <div className="console-head"><span>CONSOLE</span><button type="button" onClick={() => setSandboxLogs([])}>Clear</button></div>
                  {sandboxLogs.length ? sandboxLogs.map((item, i) => <div className={`console-line ${item.kind}`} key={i}><b>{item.kind}</b><span>{item.text}</span></div>) : <span className="console-empty">console.log(), warnings and errors will appear here.</span>}
                </div>
              </div>
            </div>
            <div className="profile-actions sandbox-actions">
              <button className="secondary big-btn" onClick={() => setPage("mission")}>← Back to Mission</button>
              <button className="secondary big-btn" onClick={openSettings}>⚙ Settings</button>
            </div>
          </section>
        </main>
      ) : page === "profile" ? (
        <main className="single-page">
          <section className="profile-page">
            <div className="profile-hero">
              <div className="profile-avatar">⚛</div>
              <div>
                <span className="eyebrow">PLAYER PROFILE</span>
                <h1>{profileName || "React Cadet"}</h1>
                <p>Your ReactQuest loadout, progress and achievements.</p>
              </div>
            </div>
            <div className="profile-grid">
              <div className="card profile-card">
                <div className="card-title">🛡 YOUR LOADOUT</div>
                <label className="field-label">PLAYER NAME</label>
                <input className="profile-input" value={profileName} maxLength={32} onChange={e => setProfileName(e.target.value)} placeholder="Enter your name" />
                <div className="profile-stat-grid">
                  <div><span>LEVEL</span><b>{level}</b></div>
                  <div><span>XP</span><b>{xp.toLocaleString()}</b></div>
                  <div><span>MISSIONS</span><b>{solved.length}/{missions.length}</b></div>
                  <div><span>STREAK</span><b>{streak}</b></div>
                </div>
              </div>
              <div className="card profile-card">
                <div className="card-title">🏆 ACHIEVEMENTS</div>
                <Achievement icon="⚛️" title="First Render" done={solved.length >= 1} />
                <Achievement icon="🐛" title="Bug Hunter" done={solved.filter(id => missions.find(m => m.id === id)?.type === "debug").length >= 3} />
                <Achievement icon="⚡" title="State Hacker" done={solved.filter(id => [7, 8, 9, 10].includes(id)).length >= 4} />
                <Achievement icon="👑" title="React Architect" done={solved.length === missions.length} />
              </div>
            </div>
            <div className="profile-actions">
              <button className="secondary big-btn" onClick={() => { setPage("mission"); setRightOpen(false); }}>← Back to Mission</button>
            </div>
          </section>
        </main>
      ) : (
        <main className="single-page">
          <section className="settings-page">
            <div className="profile-hero">
              <div className="profile-avatar">⚙</div>
              <div>
                <span className="eyebrow">GAME SETTINGS</span>
                <h1>Settings</h1>
                <p>Manage your ReactQuest profile and saved game progress.</p>
              </div>
            </div>
            <div className="card settings-card">
              <div className="card-title">💾 SAVE DATA</div>
              <div className="settings-row">
                <div><b>Resume level</b><small>ReactQuest remembers the last level you opened, including an unfinished level.</small></div>
                <strong>LEVEL {current}</strong>
              </div>
              <div className="settings-row">
                <div><b>Progress</b><small>{solved.length} of {missions.length} missions cleared · {xp.toLocaleString()} XP</small></div>
                <strong>{progress}%</strong>
              </div>
            </div>
            <div className="card settings-danger">
              <div className="card-title">⚠ RESET GAME</div>
              <p>This clears your cleared missions, XP, streak, saved code drafts, and resume level. Your player name is kept.</p>
              <button className="danger-btn" onClick={() => { setResetText(""); setResetOpen(true); }}>↺ Reset Game Progress</button>
            </div>
            <div className="profile-actions">
              <button className="secondary big-btn" onClick={openProfile}>← Player Profile</button>
              <button className="secondary big-btn" onClick={() => setPage("mission")}>← Back to Mission</button>
            </div>
          </section>
        </main>
      )}
      {resetOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="confirm-modal">
            <div className="confirm-icon">⚠</div>
            <span className="eyebrow">RESET CONFIRMATION</span>
            <h2 id="reset-title">Reset your game?</h2>
            <p>This will erase all cleared levels, XP, streak, saved code drafts, and your current/resume level. This cannot be undone.</p>
            <label className="field-label" htmlFor="reset-confirm">TYPE CONFIRM TO CONTINUE</label>
            <input id="reset-confirm" className="profile-input" autoFocus value={resetText} onChange={e => setResetText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && resetText.trim().toUpperCase() === "CONFIRM") resetGame(); }} placeholder="CONFIRM" />
            <div className="modal-actions">
              <button className="secondary big-btn" onClick={() => { setResetOpen(false); setResetText(""); }}>Cancel</button>
              <button className="danger-btn" disabled={resetText.trim().toUpperCase() !== "CONFIRM"} onClick={resetGame}>Reset Everything</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Achievement({ icon, title, done }) {
  return <div className={`achievement ${done ? "done" : ""}`}><span>{icon}</span><div><b>{title}</b><small>{done ? "UNLOCKED" : "LOCKED"}</small></div><span className="ico">{done ? "✅" : "🔒"}</span></div>
}

createRoot(document.getElementById("root")).render(<App />);