import 'dotenv/config';
import OpenAI from 'openai';
import {createInterface} from 'node:readline/promises';

const apiKey=process.env.OPENAI_API_KEY;
const mcpUrl=process.env.PUBLIC_MCP_URL;
const oauthToken=process.env.MCP_OAUTH_ACCESS_TOKEN;
if (!apiKey || !mcpUrl || !oauthToken) {
  throw new Error('Set OPENAI_API_KEY, PUBLIC_MCP_URL and MCP_OAUTH_ACCESS_TOKEN in .env');
}

const openai=new OpenAI({apiKey});
const model=process.env.OPENAI_MODEL??'gpt-6';
const rl=createInterface({input:process.stdin,output:process.stdout});
const tool={
  type:'mcp' as const,
  server_label:'my_wordpress',
  server_url:mcpUrl,
  authorization:oauthToken,
  require_approval:'always' as const
};
let previousResponseId:string|undefined;
console.log('Private WordPress MCP console. Type exit to quit. Approve each tool call.');
try {
  while(true) {
    const message=(await rl.question('You > ')).trim();
    if(message.toLowerCase()==='exit') break;
    if(!message) continue;
    let response=await openai.responses.create({
      model,
      instructions:'Use WordPress tools only on the configured private site. Read before modifying. Do not publish or delete. For live SEO updates explain the changes and ask the user before approval.',
      input:message,
      previous_response_id:previousResponseId,
      tools:[tool]
    });
    let steps=0;
    while(steps++<12) {
      const approvals=response.output.filter((item):item is Extract<typeof item,{type:'mcp_approval_request'}>=>item.type==='mcp_approval_request');
      if(!approvals.length) break;
      const replies=[];
      for(const item of approvals) {
        console.log('\nMCP tool awaiting approval:',JSON.stringify({name:item.name,arguments:item.arguments},null,2));
        const agree=(await rl.question('Approve this exact tool call? [yes/NO] ')).trim().toLowerCase()==='yes';
        replies.push({type:'mcp_approval_response' as const,approval_request_id:item.id,approve:agree});
      }
      response=await openai.responses.create({model,previous_response_id:response.id,input:replies,tools:[tool]});
    }
    previousResponseId=response.id;
    console.log('\nAssistant >',response.output_text||JSON.stringify(response.output,null,2),'\n');
  }
} finally {
  rl.close();
}
