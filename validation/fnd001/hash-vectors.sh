export BASE='{"cik":"0000320193","accn":"0000320193-24-000123","tax":"us-gaap","tag":"Revenues","unit":"USD","ptype":"duration","start":"2023-10-01","end":"2024-09-28","vkind":"N","val":"1"}'
export VJSON='{"V01_int_1":{"val":"1"},"V02_dec_1.0":{"val":"1.0"},"V03_neg_zero":{"val":"-0"},"V04_zero_000":{"val":"0.000"},"V05_text_NONE":{"vkind":"T","val":"NONE"},"V06_nil":{"vkind":"X","val":null},"V07_cafe_NFC":{"vkind":"T","val":"Caf\u00e9"},"V08_cafe_NFD":{"vkind":"T","val":"Cafe\u0301"},"V09_sci_1.25E3":{"val":"1.25E3"},"V10_plain_1250.00":{"val":"1250.00"},"V11_instant":{"ptype":"instant","start":null},"V12_dei_text_unit_null":{"tax":"dei","tag":"EntityRegistrantName","vkind":"T","val":"Apple Inc.","unit":null},"V13_dei_text_unit_pure":{"tax":"dei","tag":"EntityRegistrantName","vkind":"T","val":"Apple Inc.","unit":"pure"},"V14_neg_frac":{"val":"-0.0500"},"V15_bigint":{"val":"391035000000"},"V16_big61sig":{"val":"1234567890123456789012345678901234567890.123456789012345678901"},"V17_big61sig_trailing0":{"val":"1234567890123456789012345678901234567890.123456789012345678901000"},"V18_big_sci":{"val":"1234567890123456789012345678901234567890123456789012345678901E-21"},"V19_text_empty":{"tax":"dei","tag":"EntityRegistrantName","vkind":"T","val":"","unit":null},"V20_lead0_exp_edge":{"val":"0000000001e-1001"}}'
export LEXBAD='["NaN","Infinity"," 1","1e1234567","","0000000001e-1002","1.","+.5e"]'
export RJSON='{"R01_order_a":"{\"val\":1,\"accn\":\"x\"}","R02_order_b":"{\"accn\":\"x\",\"val\":1}","R03_scale_1.0":"{\"val\":1.0}","R04_scale_1":"{\"val\":1}","R05_nfc":"{\"s\":\"Caf\u00e9\"}","R06_nfd":"{\"s\":\"Cafe\u0301\"}","R07_arr_12":"[1,2]","R08_arr_21":"[2,1]","R09_null":"{\"v\":null}","R10_str_null":"{\"v\":\"null\"}","R11_empty_str":"{\"v\":\"\"}","R12_unicode_key":"{\"cl\u00e9\":1,\"a\":[true,false,null,-0.0]}","R13_ctrl_escape":"{\"t\":\"a\\u0001\\\"b\\\\\"}","X01_nfc_key_collision":"{\"Caf\u00e9\":1,\"Cafe\u0301\":2}","X02_dup_key":"{\"a\":1,\"a\":1}","X03_nan":"{\"a\":NaN}","X04_lone_surrogate":"{\"a\":\"\\ud800\"}"}'
PY=$(cat <<'PYCODE'
import hashlib,unicodedata,json,struct,os,re
DOM=b"navaroli.sec.fact_hash.v1\x00"; EXP_LIMIT=1000
LEX=re.compile(r"([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d{1,6}))?")
def canon_dec(x):
    m=LEX.fullmatch(x)
    if not m or not (m.group(2) or m.group(3)): raise ValueError("bad decimal lexeme")
    frac=m.group(3) or ""; g=((m.group(2) or "")+frac).lstrip("0")   # coefficient_digit_count = len(g) tras quitar ceros iniciales
    e=(int(m.group(4)) if m.group(4) else 0)-len(frac)
    if abs(e)>EXP_LIMIT+len(g): raise ValueError("exponent out of range")
    if not g: return "0"
    while g.endswith("0"): g=g[:-1]; e+=1
    if e>=0: c=g+"0"*e
    else:
        n=len(g)+e; c=(g[:n] if n>0 else "0")+"."+("0"*(-n) if n<0 else "")+g[max(n,0):]
    return ("-" if m.group(1)=="-" else "")+c
def tlv(t,b): return bytes([t])+struct.pack(">I",len(b))+b
def s(x): return tlv(0,b"") if x is None else tlv(1,unicodedata.normalize("NFC",x).encode())
def d(x): return tlv(0,b"") if x is None else tlv(2,x.encode())
def val(f):
    k=f["vkind"]; return tlv(4,k.encode())+(tlv(3,canon_dec(f["val"]).encode()) if k=="N" else s(f["val"]) if k=="T" else tlv(0,b""))
def fact_hash(f): return hashlib.sha256(DOM+s(f["cik"])+s(f["accn"])+s(f["tax"])+s(f["tag"])+s(f["unit"])+s(f["ptype"])+d(f["start"])+d(f["end"])+val(f)).hexdigest()
class Num(str): pass
def pairs(ps):
    out={}
    for k,v in ps:
        nk=unicodedata.normalize("NFC",k)
        if nk in out: raise ValueError("duplicate key after NFC")
        out[nk]=v
    return out
def bad_const(c): raise ValueError("non-JSON constant")
def esc(t):
    t.encode("utf-8"); t=unicodedata.normalize("NFC",t); o=['"']   # encode() rechaza surrogates no emparejados
    for ch in t:
        if ch=='"': o.append('\\"')
        elif ch=="\\": o.append("\\\\")
        elif ord(ch)<0x20: o.append("\\u%04x"%ord(ch))
        else: o.append(ch)
    return "".join(o)+'"'
def canon_json(v):
    if v is None: return "null"
    if v is True: return "true"
    if v is False: return "false"
    if isinstance(v,Num): return canon_dec(v)
    if isinstance(v,str): return esc(v)
    if isinstance(v,list): return "["+",".join(canon_json(x) for x in v)+"]"
    ks=sorted(v.keys(),key=lambda k:k.encode("utf-8"))
    return "{"+",".join(esc(k)+":"+canon_json(v[k]) for k in ks)+"}"
def raw_json_sha256(text):
    v=json.loads(text,parse_float=Num,parse_int=Num,parse_constant=bad_const,object_pairs_hook=pairs)
    return hashlib.sha256(b"navaroli.sec.raw_json.v1\x00"+canon_json(v).encode("utf-8")).hexdigest()
B=json.loads(os.environ["BASE"])
for k,o in json.loads(os.environ["VJSON"]).items(): print(k,fact_hash({**B,**o}))
for x in json.loads(os.environ["LEXBAD"]):
    try: canon_dec(x); print("LEX accepted",json.dumps(x))
    except Exception: print("LEX rejected",json.dumps(x))
for k,t in json.loads(os.environ["RJSON"]).items():
    try: print(k,raw_json_sha256(t))
    except Exception: print(k,"REJECTED")
PYCODE
)
TS=$(cat <<'TSCODE'
const {createHash}=require("crypto");
const EXP_LIMIT=1000,E=Buffer.alloc(0),DOM=Buffer.from("navaroli.sec.fact_hash.v1\0");
function canonDec(x){const m=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d{1,6}))?$/.exec(x);
 if(!m||!(m[2]||m[3]))throw Error("bad decimal lexeme");
 const frac=m[3]||"";let g=((m[2]||"")+frac).replace(/^0+/,"");   // coefficient_digit_count = g.length tras quitar ceros iniciales
 const ex=m[4]?Number(m[4]):0;if(!Number.isSafeInteger(ex))throw Error("exponent not safe");
 let e=ex-frac.length;if(Math.abs(e)>EXP_LIMIT+g.length)throw Error("exponent out of range");
 if(!g)return "0";
 while(g.endsWith("0")){g=g.slice(0,-1);e++;}
 let c;if(e>=0)c=g+"0".repeat(e);else{const n=g.length+e;c=(n>0?g.slice(0,n):"0")+"."+(n<0?"0".repeat(-n):"")+g.slice(Math.max(n,0));}
 return (m[1]==="-"?"-":"")+c;}
const tlv=(t,b)=>{const h=Buffer.alloc(5);h[0]=t;h.writeUInt32BE(b.length,1);return Buffer.concat([h,b]);};
const s=x=>x===null?tlv(0,E):tlv(1,Buffer.from(x.normalize("NFC"),"utf8"));
const d=x=>x===null?tlv(0,E):tlv(2,Buffer.from(x));
const val=f=>Buffer.concat([tlv(4,Buffer.from(f.vkind)),f.vkind==="N"?tlv(3,Buffer.from(canonDec(f.val))):f.vkind==="T"?s(f.val):tlv(0,E)]);
const factHash=f=>createHash("sha256").update(Buffer.concat([DOM,s(f.cik),s(f.accn),s(f.tax),s(f.tag),s(f.unit),s(f.ptype),d(f.start),d(f.end),val(f)])).digest("hex");
// Parser JSON propio sin pérdida: los números se conservan como lexema (sin JSON.parse ni float)
function parseLossless(t){let i=0;const ws=()=>{while(i<t.length&&" \t\n\r".includes(t[i]))i++;};
 const str=()=>{i++;let o="";for(;;){const c=t[i++];if(c===undefined)throw Error("eof");if(c==='"')return o;
  if(c==="\\"){const n=t[i++];if(n==="u"){o+=String.fromCharCode(parseInt(t.slice(i,i+4),16));i+=4;}
   else o+={'"':'"',"\\":"\\","/":"/",b:"\b",f:"\f",n:"\n",r:"\r",t:"\t"}[n]??(()=>{throw Error("esc")})();}
  else{if(c<" ")throw Error("ctrl");o+=c;}}};
 const v=()=>{ws();const c=t[i];
  if(c==="{"){i++;const o=new Map();ws();if(t[i]==="}"){i++;return o;}
   for(;;){ws();if(t[i]!=='"')throw Error("key");const k=str().normalize("NFC");if(o.has(k))throw Error("duplicate key after NFC");
    ws();if(t[i++]!==":")throw Error(":");o.set(k,v());ws();const n=t[i++];if(n==="}")return o;if(n!==",")throw Error(",");}}
  if(c==="["){i++;const a=[];ws();if(t[i]==="]"){i++;return a;}
   for(;;){a.push(v());ws();const n=t[i++];if(n==="]")return a;if(n!==",")throw Error(",");}}
  if(c==='"')return str();
  for(const [w,r] of [["true",true],["false",false],["null",null]])if(t.startsWith(w,i)){i+=w.length;return r;}
  const m=/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.slice(i));if(!m)throw Error("token");i+=m[0].length;return {num:m[0]};};
 const r=v();ws();if(i!==t.length)throw Error("trailing");return r;}
const LONE=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const esc=x=>{if(LONE.test(x))throw Error("lone surrogate");let o='"';for(const ch of x.normalize("NFC")){const cp=ch.codePointAt(0);
 o+=ch==='"'?'\\"':ch==="\\"?"\\\\":cp<0x20?"\\u"+cp.toString(16).padStart(4,"0"):ch;}return o+'"';};
const cmp=(a,b)=>Buffer.compare(Buffer.from(a,"utf8"),Buffer.from(b,"utf8"));
function canonJson(v){if(v===null)return "null";if(v===true)return "true";if(v===false)return "false";
 if(typeof v==="string")return esc(v);if(Array.isArray(v))return "["+v.map(canonJson).join(",")+"]";
 if(v instanceof Map)return "{"+[...v.keys()].sort(cmp).map(k=>esc(k)+":"+canonJson(v.get(k))).join(",")+"}";
 return canonDec(v.num);}
const RDOM=Buffer.from("navaroli.sec.raw_json.v1\0");
const rawJsonSha256=t=>createHash("sha256").update(Buffer.concat([RDOM,Buffer.from(canonJson(parseLossless(t)),"utf8")])).digest("hex");
const B=JSON.parse(process.env.BASE);
for(const [k,o] of Object.entries(JSON.parse(process.env.VJSON)))console.log(k,factHash({...B,...o}));
for(const x of JSON.parse(process.env.LEXBAD)){try{canonDec(x);console.log("LEX accepted",JSON.stringify(x));}catch{console.log("LEX rejected",JSON.stringify(x));}}
for(const [k,t] of Object.entries(JSON.parse(process.env.RJSON))){try{console.log(k,rawJsonSha256(t));}catch{console.log(k,"REJECTED");}}
TSCODE
)
P=$(python3 -c "$PY"); T=$(bun -e "$TS")
echo "$P"; echo "--- $(python3 --version) / bun $(bun --version)"
[ "$P" = "$T" ] && echo "DIFF: empty (identical, $(echo "$P"|wc -l) lines)" || diff <(echo "$P") <(echo "$T")
