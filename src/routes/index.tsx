import { Title } from "@solidjs/meta";

import { getRows, parseFile, saveDeck, uploadDeck, waitForCode } from "../server";
import { createSignal, onMount, Show } from "solid-js";
import { clientOnly } from "@solidjs/start";
import { toPng } from 'html-to-image';
import './index.css';
import { AST, parseFileContents } from "~/common";

const serverGetRows = async () => {
  "use server";
  return getRows();
}

const serverUploadDeck = async (dataUrl: string, deckName: string) => {
  "use server";
  return uploadDeck(dataUrl, deckName);
}

const serverParseFile = async (filePath: string) => {
  "use server";
  return parseFile(filePath);
}

const serverSaveDeck = async (dataUrl: string, deckName: string) => {
  "use server";
  return saveDeck(dataUrl, deckName);
}

// export function updateCode(code: {key: string, value: string[]}[]) {
//   clientOnly(() => {
//     console.log("server update code", code);
//     setCode(code);
//   });
// }
const serverWaitForCode = async () => {
  "use server";
  const ast = await waitForCode()
  return ast;
}

const [header, setHeader] = createSignal<string[]>([]);
const [headerMap, setHeaderMap] = createSignal<{[key: string]: number}>({});

export default function Home() {
  const [rows, setRows] = createSignal<any[][] | null>(null);
  const [container, setContainer] = createSignal<HTMLElement | null>(null);
  const [output, setOutput] = createSignal<HTMLElement | null>(null);
  const [code, setCode] = createSignal<AST>([]);
  const [deckUrl, setDeckUrl] = createSignal<string | null>(null);
  const [dataUrl, setDataUrl] = createSignal<string | null>(null);
  const [countIndex, setCountIndex] = createSignal(1);
  const [renderState, setRenderState] = createSignal("");
  const [deckName, setDeckName] = createSignal("Deck");
  const [download, setDownload] = createSignal(false);
  const [startTime, setStartTime] = createSignal(0);

  onMount(() => {
    setContainer(document.createElement("div"));
    container()!.id = "cards";
    setOutput(document.createElement("div"));
    output()!.id = "output";
    const rowPromise = serverGetRows().then((rows)=> {
      if(!rows) return;
      setHeader(rows.shift() ?? []);
      setRows(rows);
      const map: {[key: string]: number} = {};
      header().forEach((key, i) => {
        map[key.toLowerCase()] = i;
      });
      setHeaderMap(map);
    });
    const filePromise = serverParseFile("Deck.txt").then(setCode);
    Promise.all([rowPromise, filePromise]).then(() => {
      render();
    });
    setTimeout(async () => {
      while(true) {
        setCode(await serverWaitForCode());
        console.log("code updated");
        render();
      }
    }, 100);
  });

  const render = async () => {
    //setTimeout(() => {domToPng(document.getElementById("cards") as HTMLElement, {scale: 1, fetch:{requestInit: {mode: 'no-cors'}}}).then(function (dataUrl: string) {
    output()!.innerHTML = "";
    setRenderState("Rendering");
    setStartTime(Date.now());
    setTimeout(() => {toPng(document.getElementById("cards") as HTMLElement, {pixelRatio: 1, includeQueryParams: true}).then(function (dataUrl: string) {
      setDataUrl(dataUrl);
      var img = new Image();
      img.src = dataUrl;
      document.getElementById("output")?.appendChild(img);
      setRenderState("Rendered in " + (Date.now()-startTime()) + "ms");
      serverSaveDeck(dataUrl, deckName());
      if(download()) {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "Deck.png";
        link.click();
      }
    }).catch(function (error: any) {
      console.error(error);
    })}, 0);
    const rowsRef = rows();
    const codeRef = code();
    if(!rowsRef || !codeRef) return;
    container()!.innerHTML = "";
    for(const row of rowsRef) {
      const copies = row[headerMap()["count"]-1+countIndex()];
      if(copies > 0) {
        for (let i = 0; i < copies; i++) {
          const card = parseCode(codeRef, row);
          container()!.appendChild(card);
        }
      }
    }
  }

  const uploadDeck = async () => {
    const dataUrlRef = dataUrl();
    if(!dataUrlRef) return;
    serverUploadDeck(dataUrlRef, deckName()).then((id) => {
      if(id && typeof id === 'string') {
        console.log("uploaded deck with id: " + id);
        setDeckUrl("https://drive.google.com/thumbnail?id=" + id + "&sz=w7100");
      }
    });
  }

  const updateCode = () => {
    const file = (document.querySelector('input[type="file"]') as HTMLInputElement).files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const contents = e.target?.result;
      if(typeof contents === 'string') {
        setCode(parseFileContents(contents));
      }
    }
    reader.readAsText(file);
  }

  return (
    <main>
      <Title>ranDECK</Title>
      <h1>ranDECK</h1>
      <Show when={(code()?.length ?? 0) > 0 && (rows()?.length ?? 0) > 0} fallback={<p>Loading...</p>}>
        <div>Code File <input type="file" value="" onInput={(e) => updateCode()}/></div>
        <div>Deck Name <input type="text" value={deckName()} onInput={(e) => setDeckName((e.target as HTMLInputElement).value)}/></div>
        <div>Count {countIndex()} <input type="number" value={countIndex()} onInput={(e) => setCountIndex(parseInt((e.target as HTMLInputElement).value))}/></div>
        <div>Download After Render <input type="checkbox" value={download()+""} onInput={(e) => setDownload((e.target as HTMLInputElement).checked)}/></div>
        <div>
          <button onClick={render}>Render</button>
          <button onClick={uploadDeck}>Upload Deck</button>
        </div>
        <div>{renderState()}</div>
        <Show when={deckUrl() !== null}> Deck: <a href={deckUrl() ?? ""}>{deckUrl()}</a></Show>
        { container() }
        { output() }
      </Show>
    </main>
  );
}

const parseCode = (code: { key: string, value: string[]}[], row: string[]) => {
  const images: {[key: string]: {url: string, width: number, height: number, flags: string}} = {};
  const card = document.createElement("div");
  const ifStack: boolean[] = [];
  const ifFinished: boolean[] = [];
  let deckId = "";
  let pageName = "";
  let fontFamily = "JetBrains Mono";
  let fontSize = "12";
  let fontFlag = "T";
  let fontColor = "#000000";
  let fontAlign = "center";
  let htmlFont = {fontFamily: "JetBrains Mono", fontSize: "12", fontFlag: "T", fontColor: "#000000", fontAlign: "center"};
  let borderWidth = 0;

  // console.log(row);

  for (const line of code) {
    let {key, value} = line;
    if(key.toLowerCase() == "endif") {
      // console.log(ifStack);
      ifStack.pop();
      ifFinished.pop();
      // console.log(ifStack);
      continue;
    }
    if(key.toLowerCase() == "else") {
      if(!ifFinished[ifFinished.length-1]) ifStack[ifStack.length-1] = true;
      else ifStack[ifStack.length-1] = false;
      continue;
    }
    if(key.toLowerCase() == "elseif") {
      if(!ifFinished[ifFinished.length-1] ) {
        ifStack[ifStack.length-1] = parseIf(value[0], row);
        if(ifStack[ifStack.length-1]) ifFinished[ifFinished.length-1] = true;
      } else ifStack[ifStack.length-1] = false;
      continue;
    }
    if(ifStack.includes(false)) {
      if(key.toLowerCase() == "if") {
        ifStack.push(false);
        ifFinished.push(false);
      }
      continue;
    }
    switch(key.toLowerCase()) {
      case "link":
        const deckLocation = value[0].split('!');
        deckId = deckLocation[0];
        pageName = deckLocation[1];
        break;
      case "htmlimage":
        images[value[1]] = {url: parseString(value[2]), width: parseFloat(value[3]), height: parseFloat(value[4]), flags: value[5]};
        break;
      case "rectangle":
        const rect = document.createElement("div");
        if(parseUnit(value[7]).endsWith("%")) borderWidth = parsePercentage(parseUnit(value[7]))*710;
        else borderWidth = unitToPx(parseUnit(value[7]));
        rect.style.position = "absolute";
        rect.style.left = parsePercentage(parseUnit(value[1]))*710-borderWidth/2+"px";
        rect.style.top = parsePercentage(parseUnit(value[2]))*1065-borderWidth/2+"px";
        rect.style.width = parsePercentage(parseUnit(value[3]))*710+borderWidth+"px";
        rect.style.height = parsePercentage(parseUnit(value[4]))*1065+borderWidth+"px";
        rect.style.borderColor = value[5];
        rect.style.backgroundColor = value[6];
        if(value[6] == "empty") rect.style.backgroundColor = "transparent";
        rect.style.borderWidth = borderWidth+"px";
        rect.style.borderStyle = 'solid';
        card.appendChild(rect);
        break;
      case "if":
        ifStack.push(parseIf(value[0], row));
        ifFinished.push(ifStack[ifStack.length-1]);
        break;
      case "text":
        const div = document.createElement("div");
        div.style.position = "absolute";
        div.style.verticalAlign = "middle";
        div.style.alignContent = "center";
        div.style.display = "flex";
        div.style.justifyContent = "center";
        div.style.alignItems = "center";
        div.style.left = parseUnit(value[2]);
        div.style.top = parseUnit(value[3]);
        div.style.width = parseUnit(value[4]);
        div.style.height = parseUnit(value[5]);
        const text = document.createElement("span");
        text.style.fontFamily = fontFamily;
        text.style.fontSize = parseInt(fontSize)*3.2+"pt";
        text.style.color = fontColor;
        text.innerText = parseValue(value[1], row);
        // text.style.width = parseUnit(value[4]);
        // text.style.height = parseUnit(value[5]);
        if(fontFlag.includes("F")) text.style.fontSize = calcFontSize(text, div.style.width, div.style.height, text.style.fontSize);
        div.appendChild(text);
        card.appendChild(div);
        break;
      case "font":
        fontFamily = value[0];
        fontSize = value[1];
        fontFlag = value[2];
        fontColor = value[3];
        break;
      case "polygon":
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        // svg.setAttribute("viewBox", "0 0 100 100");
        svg.style.position = "absolute";
        svg.style.left = parseUnit(value[1]);
        svg.style.top = parseUnit(value[2]);
        const width = 710*parsePercentage(parseUnit(value[3]));
        const height = 1065*parsePercentage(parseUnit(value[4]));
        const scale = Math.min(width, height);
        svg.setAttribute("width", parseUnit(value[3]));
        svg.setAttribute("height", parseUnit(value[4]));
        // svg.style.width = parseUnit(value[3]);
        // svg.style.height = parseUnit(value[3]);
        svg.setAttribute("viewBox", "0 0 "+scale+" "+scale);
        const sides = parseInt(value[5]);
        const angle = parseFloat(value[6])/180*Math.PI-Math.PI/2;
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        let points = "";
        for (let i = 0; i < sides; i++) {
          points += (Math.cos(angle + i * 2 * Math.PI / sides) + 1) * scale/2 + "," + (Math.sin(angle + i * 2 * Math.PI / sides) + 1) * scale/2 + " ";
        }
        poly.setAttribute("points", points);
        poly.style.stroke = value[7];
        poly.style.fill = value[8];
        poly.style.strokeWidth = unitToPx(parseUnit(value[9]))+"px";
        svg.appendChild(poly);
        card.appendChild(svg);
        break;
      case "htmltext":
        const html = document.createElement("div");
        html.style.position = "absolute";
        html.style.textAlign = htmlFont.fontAlign;
        html.style.fontFamily = htmlFont.fontFamily;
        html.style.fontSize = parseInt(htmlFont.fontSize)*3.2+"pt";
        html.style.color = htmlFont.fontColor;
        html.innerHTML = parseValue(value[1], row).replace(/\((.*?)\)/g, (c) => {
          const image = images[c];
          if(!image) return c;
          if(image.url.startsWith("C:")) return c;
          return `<img src="${toLocalUrl(image.url)}" width="${unitToPx(image.width)}" height="${unitToPx(image.height)}" style="vertical-align:middle;${image.flags}">`;
        });
        html.style.left = parseUnit(value[2]);
        html.style.top = parseUnit(value[3]);
        html.style.width = parseUnit(value[4]);
        html.style.height = parseUnit(value[5]);
        if(fontFlag.includes("F")) html.style.fontSize = calcFontSize(html, html.style.width, html.style.height, html.style.fontSize, true);
        card.appendChild(html);
        break;
      case "htmlfont":
        htmlFont = {fontFamily: value[1], fontSize: value[2], fontFlag: value[3], fontColor: value[4], fontAlign: value[5]};
        break;
      case "image":
        if(parseValue(value[1], row).startsWith("C:") || parseValue(value[1], row) == "") break;
        const img = document.createElement("img");
        img.src = toLocalUrl(parseValue(value[1], row));
        img.style.position = "absolute";
        img.style.left = parseUnit(value[2]);
        img.style.top = parseUnit(value[3]);
        img.style.width = parseUnit(value[4]);
        img.style.height = parseUnit(value[5]);
        card.appendChild(img);
        break;
      case "roundrect":
        const roundRect = document.createElement("div");
        if(parseUnit(value[7]).endsWith("%")) borderWidth = parsePercentage(parseUnit(value[7]))*710;
        else borderWidth = unitToPx(parseUnit(value[7]));
        roundRect.style.position = "absolute";
        roundRect.style.left = parsePercentage(parseUnit(value[1]))*710-borderWidth/2+"px";
        roundRect.style.top = parsePercentage(parseUnit(value[2]))*1065-borderWidth/2+"px";
        roundRect.style.width = parsePercentage(parseUnit(value[3]))*710+borderWidth+"px";
        roundRect.style.height = parsePercentage(parseUnit(value[4]))*1065+borderWidth+"px";
        roundRect.style.borderColor = value[5];
        roundRect.style.backgroundColor = value[6];
        if(value[6] == "empty") roundRect.style.backgroundColor = "transparent";
        roundRect.style.borderWidth = borderWidth+"px";
        roundRect.style.borderStyle = 'solid';
        roundRect.style.borderRadius = "40px";//parseUnit(value[8])+"";
        card.appendChild(roundRect);
        break;
    }
  }

  return card;
}

const parseString = (str: string) => {
  // remove quotes on both sides
  if(!str) return "";
  return str.replace(/^"(.*)"$/, "$1");
}

const parseUnit = (str: string) => {
  if(!str) return "";
  const unit = str.replace(/{(.*?)}/g, (_, c1) => { return eval(c1) });
  return unit;
}

const parseIf = (condition: string, row: string[]) => {
  // console.log(condition);
  if(condition.includes("=")) {
    const [left, right] = condition.split("=");
    // console.log([parseValue(left, row), parseValue(right, row)]);
    // console.log(parseValue(left, row) == parseValue(right, row));
    return parseValue(left, row) == parseValue(right, row);
  } else if(condition.includes("<>")) {
    const [left, right] = condition.split("<>");
    // console.log([parseValue(left, row), parseValue(right, row)]);
    // console.log(parseValue(left, row) != parseValue(right, row));
    return parseValue(left, row) != parseValue(right, row);
  } else if(condition.includes("@")) {
    const [left, right] = condition.split("@");
    // console.log([parseValue(left, row), parseValue(right, row)]);
    // console.log(parseValue(right, row).includes(parseValue(left, row)));
    return parseValue(right, row).includes(parseValue(left, row));
  }
  return false;
}

const parseValue = (value: string, row: string[]) => {
  return parseString(value.trim()).replace(/\[(.*?)\]/g, (_, c1) => { return row[headerMap()[c1.toLowerCase()]] ?? "" }).replace("−", "-");
}

const parsePercentage = (value: string) => {
  return parseFloat(value)/100;
}

const unitToPx = (value: string | number) => {
  if(typeof value === 'number') return value/6*710;
  if(value == "") return 0;
  if(value.endsWith("%")) return parsePercentage(value)*710;
  return parseFloat(value)/6*710;
}

const calcFontSize = (elem: HTMLElement, width: string, height: string, fontSize: string, wrap?: boolean) => {
  const text = document.createElement("span");
  text.innerHTML = elem.innerHTML;
  text.style.fontFamily = elem.style.fontFamily;
  text.style.fontSize = fontSize;
  text.style.width = "inherit";
  if(wrap) text.style.width = parsePercentage(width)*710+"px";
  text.style.height = "inherit";
  if(!wrap) text.style.whiteSpace = "nowrap";
  text.style.position = "absolute";
  text.style.visibility = "hidden";
  document.body.appendChild(text);
  const widthRatio = parsePercentage(width)*710/text.getBoundingClientRect().width;
  const heightRatio = parsePercentage(height)*1065/text.getBoundingClientRect().height;
  const ratio = Math.min(Math.min(widthRatio, heightRatio), 1);
  document.body.removeChild(text);
  /* canvas calculation 
  const [textWidth, textHeight] = getTextWidth(elem.innerText, `${600} ${fontSize} ${elem.style.fontFamily}`);
  const widthRatio = parsePercentage(width)*710/textWidth;
  const heightRatio = parsePercentage(height)*1065/textHeight;
  const ratio = Math.min(Math.min(widthRatio, heightRatio), 1);
  */
  return Math.floor(parseFloat(fontSize)*ratio)+"pt";
}

let textWidthCanvas: HTMLCanvasElement | null = null;

function getTextWidth(text: string, font: string) {
  // re-use canvas object for better performance
  const canvas = textWidthCanvas ?? (textWidthCanvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  if(!context) return [0,0];
  context.font = font;
  const metrics = context.measureText(text);
  // console.log(metrics);
  return [metrics.width, metrics.fontBoundingBoxAscent+metrics.fontBoundingBoxDescent];
}

function getCssStyle(element: HTMLElement, prop: string) {
  return window.getComputedStyle(element, null).getPropertyValue(prop);
}

function getCanvasFont(el = document.body) {
  const fontWeight = getCssStyle(el, 'font-weight') || 'normal';
  const fontSize = getCssStyle(el, 'font-size') || '16px';
  const fontFamily = getCssStyle(el, 'font-family') || 'Times New Roman';
  
  return `${fontWeight} ${fontSize} ${fontFamily}`;
}

function toLocalUrl(url: string) {
  return url.replace("https://drive.google.com/thumbnail?id=", "http://localhost:8080/thumbnail?id=");
}

// const createElem = (el: string) => {
//   const elem = template(el);
//   // const ret = elem.cloneNode(true);
//   // document.cloneNode(elem)
//   if (ret.tagName === "BUTTON") {
//     ret.onclick = handleClick;
//   }
//   return ret;
// }