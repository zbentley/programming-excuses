var async = require("async");
var http = require("http");
var fs = require("fs");
var util = require("util");
var path = require("path");
//var url = require("url");
var dust = require("dustjs-linkedin");

var p = util.log;

String.prototype.toSanitizedArray = function() {
    return this
        .split("\n")
        .map(Function.prototype.call, String.prototype.trim)
        .filter(function(item) {
            return item.length && ! /^#/.test(item);
        });
};

var excuses = {};
var lastexcuses = [];
var maxlastexcuses = 5;

// Picks a random excuse, avoiding the most recent 5 picked.
function randomExcuse() {
    while ( lastexcuses.length >= maxlastexcuses ) {
        lastexcuses.shift();
    }
    var rand = Math.floor(Math.random() * ( Object.keys(excuses).length - Object.keys(lastexcuses).length));

    var counter = 0;
    var key;
    for (key in excuses) {
        if ( lastexcuses.indexOf(key) < 0 && counter++ === rand ) {
            break;
        }
    }
    lastexcuses.push(key);
    return excuses[key];
}

function coerceAndThrow(error) {
    if ( ! error instanceof Error ) {
        error = new Error(error);
    }
    throw error;
}

function maybeError (cb) {
    return function(error) { // ...and an arbitrary number of other args.
        if ( error instanceof Error || ( arguments.length === 1 && error) ) {
            coerceAndThrow(error);
        }
        cb.apply(null, Array.prototype.slice.call(arguments, 1));
    };
}

function parseShellScript() {
    var canned = [];
    fs.readFileSync("programmingexcuses.sh/programmingexcuses", "utf8")
        .toSanitizedArray()
        .forEach(function(item, index, array) {
            if ( ! canned.length ) {
                item = item.replace(/^\s*echo\s*["]/, "");
            } else if ( index === array.length - 1 ) {
                item = item.replace(/["]\s*[|].*$/, "");
            }
            canned.push(item);
        });
    fs.appendFileSync("sources/excuses1.txt", canned.sort().join("\n"));
}

function refreshExcuses() {
    p("Refreshing excuses.");
    async.waterfall([
        function(cb) {
            fs.readdir("sources", cb);
        },
        function(result, cb) {
            async.map(result, function(item, cb) {
                var fullpath = path.join("sources", item);
                async.waterfall([
                    function(cb) { fs.stat(fullpath, cb); },
                    function(stat, cb) {
                        if ( stat.isFile() ) {
                            fs.readFile(fullpath, "utf8", cb);
                        }
                    }
                ], cb);
            }, cb);
        }
    ], maybeError(function(result) {
        tempexcuses = {};
        result.forEach(function(item) {
            item.toSanitizedArray().forEach(function(item) {
                tempexcuses[item.toUpperCase()] = item;
            });
        });
        excuses = tempexcuses;
        p("Refreshed excuses");
    }));
}

var watcher = fs.watch("sources", { persistent: true, recursive: true });
watcher.on("error", coerceAndThrow);
watcher.on("change", refreshExcuses);
p("Installed watcher on sources directory");

parseShellScript();
p("Generated excuse source from programmingexcuses.sh");

dust.loadSource(dust.compile(fs.readFileSync("excuse.dust", "utf8"), "excuse"));
p("Compiled templates");

http.createServer(function(request, response) {
    response.writeHead(200);
    dust.render("excuse", { excuse: randomExcuse() }, maybeError(function(rendered) {
        response.end(rendered);
    }));
}).listen(8081, function(){
    p("Server listening on: http://localhost:%s", 8081);
});
