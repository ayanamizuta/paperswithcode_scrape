const puppeteer = require('puppeteer');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

const scrape = async (page,url,fav_threshold) => {
    await page.goto(url);
    await page.waitFor(1000)
    // fetch objects whose fav >= threshold
    const metadata = await page.evaluate((fav_threshold) => {
        return Array.from(document.querySelectorAll('.infinite-item'))
        .filter(item => 
            Number(item.querySelector(".badge-secondary").innerText.replace(",","")) >= fav_threshold)
        .map((item) => { return {
            url: item.querySelector("a").href,
            title: item.querySelector("h1 a").innerText,
        }})
    },fav_threshold)

    const result = await Promise.all(metadata.map(async item => {
        const abstract = await lock.acquire('paper', async (done) => {
            await page.goto(item.url)
            await page.waitFor(1000)

            const abstract = await page.evaluate(() => {
                document.querySelector(".paper-abstract a").click()
                return document.querySelector(".paper-abstract p")
                .innerText.replace("(show less)","")
            })

            done(null,abstract)
        }).then(ret => {
            return ret
        })
        return {
            ...item,
            abstract: abstract
        }
    }))

    return result
}

const pretty_print = async (data) => {
    // assume paste to scrapbox
    data.forEach(item => {
        console.log(`[* ${item.title}]`)
        console.log(`${item.url}`)
        console.log(`${item.abstract}`)
        console.log("\n")
    })
}

// argument number validation
if(process.argv.length != 2 + 2){
    throw new Error("arguments should be 2")
}

//main
(async () => {
    const url = process.argv[2]
    const fav_threshold = process.argv[3]

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--disable-dev-shm-usage','--no-sandbox']
    });
    const page = await browser.newPage();
    // [todo] fetch infinite-item
    await page.setViewport({width: 1200, height: 4000})
    // raise error at 4xx
    page.on('response', response => {
        const statusCode = response.status();
        if(statusCode >= 400){
            throw new Error(`catch ${statusCode} status code, where the response is: ${response}`)
        }
    });

    const result = await scrape(page,url,fav_threshold)

    await pretty_print(result)

})()