const {chromium} = require('playwright');
const path = require('path'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><html lang="en"><style>
      *{box-sizing:border-box}body{margin:0}ytd-app,ytd-browse,ytd-watch-flexy,ytd-rich-grid-renderer{display:block}
      ytd-masthead{display:block;height:56px}ytd-app>#frosted-glass{position:fixed;top:0;height:112px;width:100%;pointer-events:none}
      ytd-browse>#header,ytd-browse #chips-wrapper{height:56px;padding:8px;margin:0}
      ytd-watch-flexy>#header{height:72px}ytd-rich-grid-renderer{height:200px}#related{width:400px}
      ytd-compact-video-renderer,ytd-thumbnail{display:block}ytd-thumbnail{width:196px;height:110px}
    </style><ytd-app><div id="frosted-glass" class="with-chipbar"></div><ytd-masthead>YouTube navigation</ytd-masthead>
      <ytd-browse page-subtype="home"><div id="header"> \n <div id="chips-wrapper"><div></div></div></div><div id="primary"><ytd-rich-grid-renderer>Native Home</ytd-rich-grid-renderer></div></ytd-browse>
      <ytd-watch-flexy><div id="header">Watch header and playlist controls</div><div id="related"><ytd-compact-video-renderer><ytd-thumbnail></ytd-thumbnail></ytd-compact-video-renderer></div></ytd-watch-flexy>
    </ytd-app></html>`);
    for (const file of ['core.js', 'feed.js', 'feed-theme.js', 'home.js']) await page.addScriptTag({path: path.join(root, 'src', file)});
    await page.addStyleTag({path: path.join(root, 'src/content.css')});
    await page.evaluate(() => {
      window.settings = IntentCore.defaults(); window.runtime = {sendMessage: async () => ({ok: true, key: IntentFeed.key(settings), items: [], nextCursor: 1, hasMore: false})};
      window.home = new IntentHome(runtime);
      window.measure = () => ({header: document.querySelector('ytd-browse>#header').getBoundingClientRect().height, chips: document.querySelector('#chips-wrapper').getBoundingClientRect().height, glass: document.querySelector('ytd-app>#frosted-glass').getBoundingClientRect().height, masthead: document.querySelector('ytd-masthead').getBoundingClientRect().height, watch: document.querySelector('ytd-watch-flexy>#header').getBoundingClientRect().height});
      window.baseline = measure(); home.sync(settings, true);
    });
    await page.waitForFunction(() => home.feedState === 'active');
    assert.deepEqual(await page.evaluate(() => measure()), {header: 0, chips: 0, glass: 56, masthead: 56, watch: 72}, 'empty nested Home wrappers collapse and decorative glass retains the masthead portion');
    assert.equal(await page.evaluate(() => home.host.getBoundingClientRect().top), 56, 'feed begins directly below the native masthead');
    await page.evaluate(() => home.sync({...settings, mode: 'off'}, true));
    assert.deepEqual(await page.evaluate(() => measure()), await page.evaluate(() => baseline), 'Off restores original empty wrapper and glass dimensions');
    assert.equal(await page.locator('[data-intent-empty-home-spacing],[data-intent-home-glass]').count(), 0);
    await page.evaluate(() => {
      home.sync(settings, true);
      const button = document.createElement('button'); button.textContent = 'Useful Home action'; document.querySelector('#chips-wrapper > div').append(button);
      home.sync(settings, true);
    });
    assert.equal(await page.getByRole('button', {name: 'Useful Home action'}).isVisible(), true, 'new meaningful content inside previously collapsed nested wrappers becomes visible immediately');
    assert.equal(await page.locator('ytd-browse>#header').getAttribute('data-intent-empty-home-spacing'), null);
    await page.evaluate(() => {
      document.querySelector('#chips-wrapper').replaceChildren();
      const chips = document.createElement('ytd-feed-filter-chip-bar-renderer'); chips.textContent = 'All · Music';
      const notice = document.createElement('p'); notice.textContent = 'Useful Home announcement';
      document.querySelector('ytd-browse>#header').append(chips, notice); home.sync(settings, true);
    });
    assert.equal(await page.getByText('Useful Home announcement').isVisible(), true, 'a chip-containing header with meaningful sibling content is preserved');
    await page.evaluate(() => {
      const content = document.createElement('span'); content.textContent = 'Meaningful glass overlay'; document.querySelector('ytd-app>#frosted-glass').append(content); home.sync(settings, true);
    });
    assert.equal(await page.evaluate(() => measure().glass), 112, 'app glass with meaningful content is not shortened');
    await page.evaluate(() => {document.querySelector('ytd-app>#frosted-glass').replaceChildren(); home.sync(settings, true);});
    assert.equal(await page.evaluate(() => measure().glass), 56);
    await page.evaluate(() => home.sync(settings, false));
    assert.equal(await page.locator('[data-intent-empty-home-spacing],[data-intent-home-glass]').count(), 0, 'Pause removes all owned spacing markers');
    assert.equal(await page.locator('html').getAttribute('data-intent-feed'), null);
    assert.equal(await page.evaluate(() => measure().glass), 112);
    await page.evaluate(() => {window.watch = new IntentHome(runtime, 'watch'); watch.sync(settings, true);});
    assert.equal(await page.evaluate(() => watch.host.style.getPropertyValue('--intent-watch-thumbnail-width')), '196px', 'watch cards use the native recommendation thumbnail width');
    await page.evaluate(() => {document.querySelector('ytd-thumbnail').style.width = 'auto'; watch.sync(settings, true);});
    assert.equal(await page.evaluate(() => watch.host.style.getPropertyValue('--intent-watch-thumbnail-width')), '196px', 'a hidden native thumbnail without a measurable width retains the last reliable native metric');
    await page.evaluate(() => watch.destroy());
    assert.deepEqual(errors, []);
    console.log('PASS Home spacing: empty and nested chip wrappers, masthead glass, meaningful dynamic content, Off/Pause restoration, untouched Watch header and native thumbnail metric.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
