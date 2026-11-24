const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
module.exports = function () {
  const exported = {};
  const source = fs.readFileSync(path.join(__dirname, '../services/enquiryProvider.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {exports: exported, URL});
  for (const [input, figures, words] of [
    ['100000','₹1,00,000','One Lac'], ['115000','₹1,15,000','One Lac Fifteen Thousand'],
    ['160000','₹1,60,000','One Lac Sixty Thousand'], ['1,00,00,00,000','₹1,00,00,00,000','One Hundred Crore'],
    [1000000000,'₹1,00,00,00,000','One Hundred Crore'], ['100 CR','₹1,00,00,00,000','One Hundred Crore'],
    ['1.6 L','₹1,60,000','One Lac Sixty Thousand'], ['50 K','₹50,000','Fifty Thousand'],
    ['100000.50','₹1,00,000.50','One Lac Rupees and Fifty Paise'],
  ]) {
    const value = exported.formatEnquiryBudget(input);
    assert.equal(value.figures, figures); assert.equal(value.words, words);
  }
  assert.equal(exported.formatEnquiryBudget('On request').words, '');
  const current = exported.enquiryProviderDetails({original:{provider_fields:{listing_id:'old',listing_URL:'https://example.com/old'}},current:{provider_fields:{listing_id:'new',response_id:'123',message:'New message',listing_URL:''}}});
  assert.equal(current.listing_id,'new'); assert.equal(current.response_id,'123'); assert.equal(current.message,'New message'); assert.equal(current.listing_url,'');
  assert.equal(exported.enquiryProviderDetails({original:{provider_fields:{listing_URL:'javascript:alert(1)'}}}).listing_url,'');
  assert.equal(exported.enquiryProviderDetails({provider_details:{listing_id:'from-api'}}).listing_id,'from-api');
  const legacy = exported.enquiryProviderDetails({provider_details:{location:'',configuration:'',budget:''},original:{questions:['Budget','Configuration','Location'],answers:['80 L','2 BHK','Salt Lake']}});
  assert.equal(legacy.location, 'Salt Lake');
  assert.equal(legacy.configuration, '2 BHK');
  assert.equal(legacy.budget, '80 L');
  const property = fs.readFileSync(path.join(__dirname, '../components/EnquiryPropertyDetails.tsx'), 'utf8');
  assert.match(property, /Property details not provided by Magicbricks/);
  return 'PASS: nine Indian budget formats, current provider details, cleared/unsafe links and API fields.';
};
