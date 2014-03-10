function Story() {
}

Story.stories = null;

Story.load = function() {
    $.get('story/stories.yaml', function(data) {
        Story.stories = jsyaml.load(data);
    });

    $.get('story/commonOptions.yaml', function(data) {
        Story.commonOptions = jsyaml.load(data);
    });
};

Story.load();

Story.toNumber = function(litOrDice) {
    if (typeof litOrDice == "string") {
        if(litOrDice.substring(0, 1) == '-') {
            // handle negative dice throws
            return -RNG.roller(litOrDice.substring(1), RNG.$)();
        } else {
            return RNG.roller(litOrDice, RNG.$)();
        }
    } else {
        return litOrDice;
    }
};

Story.toArray = function(litOrArray) {
    if (typeof litOrArray == "array") {
        return litOrArray;
    } else {
        return [litOrArray];
    }
};

Story.scripts = {
    newmember: function(name) {
        game.player.party.push(name);
        game.message(name + ' joins your party.');
        Sfx.play('get');
    },
    remove: function(name) {
        game.player.party = game.player.party.filter(function(member) {
            return name !== member;
        });
        game.message(name + ' leaves your party.');
        Sfx.play('thwart');
    },
    message: function(message, clazz) {
        game.message(message, clazz);
    },
    newitem: function(name) {
        game.player.items.push(name);
        game.message('You received a ' + name);
    },
    removeitem: function(name) {
        game.player.items = game.player.items.filter(function(item) {
            return name !== item;
        });
        game.message('You lost a ' + name);
    },
    removerandom: function() {
        Story.scripts.remove(Game.randomChoice(game.player.party));
    },
    karma: function(n) {
        game.player.karma += Story.toNumber(n);
    },
    supplies: function(n) {
        game.player.supplies += Story.toNumber(n);
    },
    advance: function(n) {
        for (var i = 0; i < n; i++) {
            game.map.advance();
        }
    },
    play: function(name) {
        Sfx.play(name);
    },
    gameOver: function() {
        game.end();
    },
    setState: function(story, state) {
        game.setStoryState(story, state);
    },
    reuseable: function(story) {
        story.used = false;
    }
};

Story.filters = {
    hasPeople: function(people) {
        return Story.toArray(people).every(function(person) {
            return game.player.party.indexOf(person) >= 0;
        });
    },

    minParty: function(number) {
        return game.player.party.length >= number;
    },

    minSupplies: function(number) {
        return game.player.supplies >= number;
    },

    inCorruption: function() {
        var row = game.map.get(game.player.y);
        var tile = row[game.player.x];
        return tile.corrupted;
    },

    inState: function(story, state) {
        return game.getStoryState(story) == state;
    },

    atLeastState: function(story, state) {
        return game.getStoryState(story) >= state;
    }
};

// register filters as Handlebars helpers
(function() {
    Object.keys(Story.filters).forEach(function(filterName) {
        Handlebars.registerHelper(filterName, function() {
            var args = Array.prototype.slice.call(arguments);
            var butLast = args.slice(0, args.length - 1);
            if (Story.filters[filterName].apply(null, butLast)) {
                return args[args.length-1].fn(this);
            } else {
                return null;
            }
        });
    });
})();

Story.filter = function(activeFilters) {
    return activeFilters.every(function(filterSpec) {
        if (typeof filterSpec == "string") {
            return Story.filters[filterSpec]();
        } else {
            return Story.filters[filterSpec[0]].apply(null, filterSpec.slice(1));
        }
    });
};

Story.expand = function(text) {
    return Handlebars.compile(text)({
        game: game,
        filters: Story.filters
    });
};

Story.evalScripts = function(story, scripts) {
    scripts.forEach(function(script) {
        if (typeof script === "string") {
            Story.scripts[script](story);
        } else {
            var args = script.slice(1);
            args.push(story);
            Story.scripts[script[0]].apply(null, args);
        }
    });
};

Story.concat = function(arrs) {
    if(arrs.length > 0) {
        return arrs[0].concat.apply(arrs[0], arrs.slice(1, -1));
    } else {
        return [];
    }
};

Story.optionsForName = function(name) {
    return Story.concat(Story.commonOptions.filter(function(options) {
        return options.name == name;
    }).map(function(options) {
        return options.options;
    }));
};

Story.optionsForNames = function(names) {
    return Story.concat(names.map(Story.optionsForName));
};

Story.show = function(story, callback) {
    Sfx.play('story');
    var title = Story.expand(story.title),
        description = Story.expand(story.description.replace(/\n/g, '</p><p>'));
    $('#story .title').html(title);
    $('#story .description').html('<p>' + description + '</p>');

    if (story.scripts) {
        Story.evalScripts(story, story.scripts);
    }

    var $options = $('#options');
    $options.empty();

    var options = (story.options || [])
        .concat(Story.optionsForNames(story.commonOptions || []));

    var validOptions =  options.filter(function(option) {
        return !option.filter || Story.filter(option.filter);
    });
    validOptions.forEach(function(option) {
        var $option = $('<li/>').addClass('option');
        $option.html(Story.expand(option.answer));
        $options.append($option);
        $option.on('click', function() {
            Story.act(option, callback);
        });
    });
    Story.register(validOptions, callback);
    $('#story .close').hide();
    $('#story').show();
};

Story.act = function(option, callback) {
    Story.unregister();
    $('#story .description').html(Story.expand(option.result));
    if (option.scripts) {
        Story.evalScripts(story, option.scripts);
    }
    $('#options').empty();
    function close(event) {
        $(document).off('keypress.close');
        $('#story .close').hide().off('click');
        $('#story').hide();
        if (callback != null) {
            callback();
        }
    }
    $('#story .close').show().on('click', close);
    $(document).on('keypress.close', function(event) {
        if (event.keyCode === 13) close();
    });
};

Story.select = function(game) {
    if (Story.stories == null) {
        return [];
    }
    return Story.stories.filter(function(story) {
        return !story.used && (!story.filter || Story.filter(story.filter));
    });
};

Story.register = function(options, callback) {
    $(document).on('keypress.options', function(event) {
        var id = event.keyCode - '1'.charCodeAt(0),
            option = options[id];
        if (option != null) {
            Story.act(option, callback);
        }
    });
};

Story.unregister = function() {
    $(document).off('keypress.options');
};
