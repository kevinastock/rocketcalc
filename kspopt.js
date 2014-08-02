/*
 * The MIT License (MIT)
 *
 *     Copyright (c) 2014 Kevin Stock
 *
 *     Permission is hereby granted, free of charge, to any person obtaining a copy
 *     of this software and associated documentation files (the "Software"), to deal
 *     in the Software without restriction, including without limitation the rights
 *     to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *     copies of the Software, and to permit persons to whom the Software is
 *     furnished to do so, subject to the following conditions:
 *
 *     The above copyright notice and this permission notice shall be included in
 *     all copies or substantial portions of the Software.
 *
 *     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *     IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *     FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *     AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *     LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *     OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *     THE SOFTWARE.
 */

'use strict';

// FIXME: limit max engines based on part selections
// FIXME: read url at load to set parameters?

function Part(type, name, size, deadend, cost, mass, fuel, thrust, iatm, ivac, gimbal, cost_save) {
    this.type      = type;
    this.name      = name;
    this.size      = size;
    this.deadend   = deadend;
    this.cost      = cost;
    this.mass      = mass;
    this.fuel      = fuel;
    this.thrust    = thrust;
    this.iatm      = iatm;
    this.ivac      = ivac;
    this.gimbal    = gimbal;
    this.cost_save = cost_save;
    this.selector  = false;
}

function Result(engine_counts, tank, tank_count, dv, mass, cost, fuel_mass, fuel_used, shutdown) {
    this.engine_counts = engine_counts;
    this.tank          = tank;
    this.tank_count    = tank_count;
    this.dv            = dv;
    this.mass          = mass;
    this.cost          = cost;
    this.fuel_mass     = fuel_mass;
    this.fuel_used     = fuel_used;
    this.shutdown      = shutdown;
    this.awards        = [];
}

var awards = [
    {name: '&#9733; Lowest cost with full tanks',         lookup: function (x) { return x.cost; },               reduce: Math.min, initial: Number.POSITIVE_INFINITY},
    {name: '&#9733; Lowest wet mass',                     lookup: function (x) { return x.mass; },               reduce: Math.min, initial: Number.POSITIVE_INFINITY},
    {name: '&#9733; Lowest dry mass',                     lookup: function (x) { return x.mass - x.fuel_mass; }, reduce: Math.min, initial: Number.POSITIVE_INFINITY},
    {name: '&#9733; Least fuel burned for requested Δv',  lookup: function (x) { return x.fuel_used; },          reduce: Math.min, initial: Number.POSITIVE_INFINITY}
];

function Shutdown(engine_counts, engine, count, stage_dv, burn_time, init_mass, end_mass, init_TWRg, end_TWRg) {
    this.engine_counts = engine_counts;
    this.engine        = engine;
    this.count         = count;
    this.stage_dv      = stage_dv;
    this.burn_time     = burn_time;
    this.init_mass     = init_mass;
    this.end_mass      = end_mass;
    this.init_TWRg     = init_TWRg;
    this.end_TWRg      = end_TWRg;
}

/*
 * Engines
 */
var all_engines = {
    Stock: [
        new Part("mono", "O-10 MonoPropellant Engine",                  0, true,  800,   0.00, 0,  20,   220, 290, 0,   []),
        new Part("LF/O", "Rockomax 24-77",                              0, true,  480,   0.09, 0,  20,   250, 300, 1.0, []),
        new Part("LF/O", "Rockomax Mark 55 Radial Mount Liquid Engine", 0, true,  850,   0.9,  0,  120,  290, 320, 3.0, []),
        new Part("LF/O", "LV-1 Liquid Fuel Engine",                     1, false, 350,   0.03, 0,  4,    220, 290, 0,   []),
        new Part("LF/O", "Rockomax 48-7S",                              1, false, 300,   0.1,  0,  30,   300, 350, 1.0, []),
        new Part("LF/O", "LV-T30 Liquid Fuel Engine",                   2, false, 850,   1.25, 0,  215,  320, 370, 0,   []),
        new Part("LF/O", "LV-T45 Liquid Fuel Engine",                   2, false, 950,   1.5,  0,  200,  320, 370, 1.0, []),
        new Part("LF/O", "LV-909 Liquid Fuel Engine",                   2, false, 750,   0.5,  0,  50,   300, 390, 0.5, []),
        new Part("LF/O", "R.A.P.I.E.R. Engine",                         2, false, 3600,  1.2,  0,  175,  320, 360, 3.0, []),
        new Part("LF/O", "Toroidal Aerospike Rocket",                   2, true,  3850,  1.5,  0,  175,  388, 390, 0,   []),
        new Part("LF/O", "LV-N Atomic Rocket Motor",                    2, false, 8700,  2.25, 0,  60,   220, 800, 1.0, []),
        new Part("LF/O", "Rockomax 'Poodle' Liquid Engine",             3, false, 1600,  2,    0,  220,  270, 390, 2.5, []),
        new Part("LF/O", "Rockomax 'Mainsail' Liquid Engine",           3, false, 5650,  6,    0,  1500, 320, 360, 1.0, []),
        new Part("LF/O", "Rockomax 'Skipper' Liquid Engine",            3, false, 2850,  3,    0,  650,  320, 370, 1.0, []),
        new Part("LF/O", "LFB KR-1x2",                                  3, true,  16400, 10,   32, 2000, 290, 340, 0.5, []),
        new Part("LF/O", "Kerbodyne KR-2L Advanced Engine",             4, false, 20850, 6.5,  0,  2500, 280, 380, 1.0, []),
        new Part("LF/O", "S3 KS-25x4 Engine Cluster",                   4, true,  32400, 9.75, 0,  3200, 320, 360, 0.5, [])
    ]
};

/*
 * Fuel Tanks
 *
 * FL-T100 is considered large since we allow engines to be mounted to bigger
 * tanks, but not the opposite, and FL-T100 has the same fuel/mass as large
 *
 * FL-R10 is better than FL-R25, considered size 2 instead to replace it
 * DUMMY TANK is used to simulate not adding tanks to LFB's
 */



var all_tanks = {
    Stock: [
        new Part("mono", "Stratus-V Roundified Monopropellant Tank",   0, false, 400,  0.075,  0.16,     0, 0, 0, 0, []),
        new Part("mono", "Stratus-V Cylindrified Monopropellant Tank", 0, false, 800,  0.15,   0.6,      0, 0, 0, 0, []),
        new Part("mono", "FL-R10 RCS Fuel Tank",                       2, false, 400,  0.05,   0.2,      0, 0, 0, 0, []),
        new Part("mono", "FL-R1 RCS Fuel Tank",                        3, false, 1300, 0.4,    3.0,      0, 0, 0, 0, []),
        new Part("LF/O", "Oscar-B Fuel Tank",                          1, false, 180,  0.015,  0.063675, 0, 0, 0, 0, []),
        new Part("LF/O", "ROUND-8 Toroidal Fuel Tank",                 1, false, 360,  0.025,  0.111,    0, 0, 0, 0, []),
        new Part("LF/O", "FL-T100 Fuel Tank",                          3, false, 250,  0.0625, 0.5,      0, 0, 0, 0, [[8, 1600], [2, 425]]),
        new Part("LF/O", "Kerbodyne S3-3600 Tank",                     4, false, 7200, 2.5,    18.0,     0, 0, 0, 0, [[4, 22800]])
    ]
};

var bodies = {
    Moho   : {gravity: 2.70,  atmo: 0,   dv: 1740},
    Eve    : {gravity: 16.7,  atmo: 100, dv: 12000},
    Gilly  : {gravity: 0.049, atmo: 0,   dv: 60},
    Kerbin : {gravity: 9.81,  atmo: 100, dv: 4500},
    Mun    : {gravity: 1.63,  atmo: 0,   dv: 1160},
    Minmus : {gravity: 0.491, atmo: 0,   dv: 360},
    Duna   : {gravity: 2.94,  atmo: 20,  dv: 1300},
    Ike    : {gravity: 1.10,  atmo: 0,   dv: 780},
    Dres   : {gravity: 1.13,  atmo: 0,   dv: 860},
    Jool   : {gravity: 7.85,  atmo: 100, dv: 22000},
    Laythe : {gravity: 7.85,  atmo: 80,  dv: 3200},
    Vall   : {gravity: 2.31,  atmo: 0,   dv: 1720},
    Tylo   : {gravity: 7.85,  atmo: 0,   dv: 4540},
    Bop    : {gravity: 0.589, atmo: 0,   dv: 440},
    Pol    : {gravity: 0.373, atmo: 0,   dv: 260},
    Eeloo  : {gravity: 1.69,  atmo: 0,   dv: 1240}
};

var g0_isp = 9.82;

/*
 * itertools replacements
 */
function combinations_with_replacement(pool, r) {
    var n = pool.length, i, t, x, y, index = 0, indices = [], results = [];

    if (r === 0 || n === 0) {
        return [];
    }

    for (i = 0; i < r; i += 1) {
        indices[i] = 0;
    }

    function produce() {
        results[index] = [];
        for (y = 0; y < r; y += 1) {
            results[index][y] = pool[indices[y]];
        }
        index += 1;
    }
    produce();

    for (i = r - 1; i >= 0; i -= 1) {
        if (indices[i] !== n - 1) {
            t = indices[i] + 1;
            for (x = i; x < r; x += 1) {
                indices[x] = t;
            }
            produce();
            i = r;
        }
    }

    return results;
}

function groupby(items) {
    if (items.length === 0) {
        return [];
    }

    var x, index = 0, count = 1, results = [], group = items[0];

    for (x = 1; x < items.length; x += 1) {
        if (group === items[x]) {
            count += 1;
        } else {
            // FIXME 'engine' should be a parameter for the users to rename
            results[index] = {engine: group, count: count};
            index += 1;
            count = 1;
            group = items[x];
        }
    }
    results[index] = {engine: group, count: count};

    return results;
}

/*
 * Helpers
 */

function sum(items, key) {
    return items.reduce(function (prev, cur) { return prev + key(cur); }, 0);
}

/*
 * Rocket Science
 */

function adjusted_isp(engine, atmo) {
    return engine.iatm * atmo + engine.ivac * (1 - atmo);
}

function total_thrust(engine_counts) {
    return sum(engine_counts, function (x) { return x.engine.thrust * x.count * x.limit; });
}

function exhaust_velocity(engine_counts, atmo) {
    var tt = total_thrust(engine_counts);
    return g0_isp * tt / sum(engine_counts, function (x) {
        return x.count * (x.engine.thrust * x.limit / adjusted_isp(x.engine, atmo));
    });
}

function required_tanks(payload, prefuel, tank, engine_counts, atmo, dv) {
    // Compute ideal mass of tank and round up to nearest number of real tanks
    var ve, eexp, f, dead_weight, ideal_mass;
    ve = exhaust_velocity(engine_counts, atmo);
    eexp = Math.exp(dv / ve);
    f = tank.mass / (tank.mass + tank.fuel);
    dead_weight = payload + sum(engine_counts, function (x) { return x.engine.mass * x.count; });
    ideal_mass = dead_weight * (1 - eexp) / (f * eexp - 1);
    return Math.ceil((ideal_mass - prefuel) / (tank.mass + tank.fuel));
}

/*
 * Optimizer
 */

function sorted_copy(engine_counts, atmo) {
    // copy engine_counts so counts can be modified
    var ec = $.map(engine_counts, function (x) { return $.extend({}, x); });
    ec.sort(function (a, b) { return adjusted_isp(a.engine, atmo) - adjusted_isp(b.engine, atmo); });
    return ec;
}

function limit_engine_thrust(engine_counts, wet_mass, TWRg, atmo) {
    if (engine_counts.length === 1) {
        return engine_counts;
    }

    var limited, extra_dv, lowest, lowest_thrust;

    limited = sorted_copy(engine_counts, atmo);
    extra_dv = total_thrust(limited) - TWRg * wet_mass;
    lowest = limited[0];
    lowest_thrust = lowest.engine.thrust * lowest.count;

    // Bump to prevent the new limit causes thrust to be less than TWRg
    lowest.limit = Math.max(0, Math.min(1, ((lowest_thrust - extra_dv) / lowest_thrust) + 0.0000001));

    return limited;
}

function shutdown_schedule(wet_mass, dry_mass, engine_counts, atmo, dv, TWRg) {
    engine_counts = sorted_copy(engine_counts, atmo);

    // Only shutting down engines in order of worst Isp first is a greedy
    // assumption, but irrelevant since there's probably only two types of
    // engines anyways

    var shutdown_sequence = [], current_mass = wet_mass, total_dv = 0, tt, ve, next_thrust, next_wet_mass, stage_dv, burn_time, init_TWRg, end_TWRg;

    engine_counts.slice(0, -1).forEach(function (current) {
        var step, engine = current.engine;

        // Number of engines to shutdown per stage
        step = 1;
        if (current.count > 1) {
            for (step = 2; step <= current.count; step += 1) {
                if (step % current.count === 0) {
                    break;
                }
            }
        }

        while (current.count > 0) {
            tt = total_thrust(engine_counts);
            ve = exhaust_velocity(engine_counts, atmo);

            // Amount of fuel which must be burned so next 'stage' works
            next_thrust = tt - engine.thrust * current.limit * step;
            next_wet_mass = next_thrust / TWRg;

            // Check if the next stage could actually work
            if (next_wet_mass <= dry_mass || current_mass < next_wet_mass) {
                break;
            }

            // Stats about this burn
            stage_dv = ve * Math.log(current_mass / next_wet_mass);
            burn_time = (current_mass - next_wet_mass) / (tt / ve);
            init_TWRg = tt / current_mass;
            end_TWRg = tt / next_wet_mass;

            if (total_dv + stage_dv >= dv) {
                // return now, this stage shuts down after goal dv
                return [shutdown_sequence, total_dv, current_mass, engine_counts];
            }

            // Add this shutdown order
            shutdown_sequence.push(new Shutdown(engine_counts, engine, step, stage_dv, burn_time, current_mass, next_wet_mass, init_TWRg, end_TWRg));

            // Update ship stats
            current_mass = next_wet_mass;
            total_dv += stage_dv;

            // Remove the engines that are being shutdown
            current.count -= step;
        }
    });

    return [shutdown_sequence, total_dv, current_mass, engine_counts];
}

function optimize_flight(payload, prefuel, dv, TWRg, atmo, engine_counts, tank, tank_count, allow_shutdown, allow_limiting) {
    var best, dry_mass, wet_mass, limited_engines, shutdown_sequence, staged_dv, stage_mass, final_engines, ssret, last_thrust, last_ve, requested_dv, last_eexp, fuel_mass, stage_dv, actual_dv, requested_fuel, requested_burn_time, init_TWRg, end_TWRg, fuel_used, cost, tmp_count;

    function mass_summer(x) { return x.engine.mass * x.count; }
    function fuel_summer(x) { return x.engine.fuel * x.count; }
    function cost_summer(x) { return x.engine.cost * x.count; }

    while (tank_count >= 0) {
        dry_mass = payload  + sum(engine_counts, mass_summer) + tank.mass * tank_count;
        wet_mass = dry_mass + sum(engine_counts, fuel_summer) + tank.fuel * tank_count + prefuel;

        if (allow_limiting) {
            limited_engines = limit_engine_thrust(engine_counts, wet_mass, TWRg, atmo);
        } else {
            limited_engines = engine_counts;
        }

        if (total_thrust(limited_engines) / wet_mass < TWRg) {
            break;
        }

        if (allow_shutdown) {
            ssret = shutdown_schedule(wet_mass, dry_mass, limited_engines, atmo, dv, TWRg);
            shutdown_sequence = ssret[0];
            staged_dv         = ssret[1];
            stage_mass        = ssret[2];
            final_engines     = ssret[3];
        } else {
            shutdown_sequence = [];
            staged_dv = 0;
            stage_mass = wet_mass;
            final_engines = limited_engines;
        }

        // Compute statistics on the last 'stage' of flight
        last_thrust = total_thrust(final_engines);
        last_ve = exhaust_velocity(final_engines, atmo);
        requested_dv = dv - staged_dv;
        last_eexp = Math.exp(requested_dv / last_ve);
        fuel_mass = wet_mass - dry_mass;
        stage_dv = last_ve * Math.log(stage_mass / dry_mass);
        actual_dv = stage_dv + staged_dv;
        requested_fuel = stage_mass * (last_eexp - 1) / last_eexp;
        requested_burn_time = requested_fuel / (last_thrust / last_ve);

        // LFB + DUMMY may not have sufficient dv, or tank count too low
        if (actual_dv  < dv) {
            break;
        }

        init_TWRg = last_thrust / stage_mass;
        end_TWRg = last_thrust / dry_mass;

        // fuel needed for requested dv only
        fuel_used = requested_fuel + wet_mass - stage_mass;

        // Cost of the tanks and engines
        cost = sum(limited_engines, cost_summer);
        tmp_count = tank_count;
        tank.cost_save.forEach(function (x) {
            cost += Math.floor(tmp_count / x[0]) * x[1];
            tmp_count %= x[0];
        });
        cost += tmp_count * tank.cost;

        shutdown_sequence.push(new Shutdown(final_engines, null, 0, requested_dv, requested_burn_time, stage_mass, stage_mass - requested_fuel, init_TWRg, end_TWRg));
        best = new Result(limited_engines, tank, tank_count, actual_dv, wet_mass, cost, fuel_mass, fuel_used, shutdown_sequence);

        tank_count -= 1;
    }

    return best;
}

function solve(payload, prefuel, dv, TWRg, atmo, max_engines, max_thrust_ratio, allow_deadend, allow_shutdown, allow_limiting, any_tanks, engines, tanks) {
    var results = [], num_engines, engine_counts, thrusts;
    // Loop through the number of allowed engines
    for (num_engines = 1; num_engines <= max_engines; num_engines += 1) {
        // Loop through the sets of engines
        combinations_with_replacement(engines, num_engines).forEach(function (engine_set) {
            engine_counts = groupby(engine_set);
            engine_counts.forEach(function (x) { x.limit = 1; });
            thrusts = $.map(engine_counts, function (x) { return x.engine.thrust; });
            if (
                // At most one type of engine with only 1
                sum(engine_counts, function (x) { return x.count === 1 ? 1 : 0; }) <= 1 &&
                // Radial engines must have 0 or 2+
                engine_counts.every(function (x) { return x.engine.size !== 0 || x.count !== 1; }) &&
                // Limit difference between biggest and smallet engine thrust
                Math.max.apply(null, thrusts) / Math.min.apply(null, thrusts) <= max_thrust_ratio &&
                // Prevent 1x engine from being a deadend (no node on engine)
                !(!allow_deadend && engine_counts.some(function (x) { return x.engine.deadend && x.count === 1; }))
            ) {

                tanks.forEach(function (tank) {
                    // Tanks must be same or bigger than biggest engine
                    if (any_tanks || Math.max.apply(null, $.map(engine_counts, function (x) { return x.engine.size; })) <= tank.size) {
                        var tank_count, best;
                        if (tank.mass === 0) {
                            tank_count = 0;
                        } else {
                            tank_count = required_tanks(payload, prefuel, tank, engine_counts, atmo, dv);
                        }

                        best = optimize_flight(payload, prefuel, dv, TWRg, atmo, engine_counts, tank, tank_count, allow_shutdown, allow_limiting);
                        if (best) {
                            results.push(best);
                        }
                    }
                });
            }
        });
    }

    return results;
}


/*
 * Interface
 */

function select_parts(from, to, type, cond) {
    $.each(from, function (k, v) {
        v.forEach(function (part) {
            if ($(part.selector).prop('checked') && part.type === type && cond(part)) {
                to.push(part);
            }
        });
    });
}

function generate_results_inner() {
    if ($('.has-error').length) {
        $('#results').html("<div class='alert alert-danger h3' role='alert'>Invalid Flight Parameters <small>Nobody understands Jeb's requirements</small></div>");
        $('#results').animate({height: 'show'}, 300);
        return;
    }

    var prefuel, payload, dv, twr, atmo, max_engines, gimbal, allow_deadend, allow_shutdown, allow_limiting, any_tanks, body, max_thrust_ratio, g0, engines, tanks, results, html;

    // Read the data in
    payload         = parseFloat($('#payload').val());
    dv              = parseFloat($('#deltav').val());
    twr             = parseFloat($('#twr').val());
    atmo            = parseFloat($('#atmo').val()) / 100;
    max_engines     = parseInt($('#maxengines').val(), 10);
    payloadmono     = parseFloat($('#payloadmono').val());
    gimbal          = $('#gimbal').prop('checked');
    allow_deadend   = !$('#deadend').prop('checked');
    allow_shutdown  = !$('#shutdown').prop('checked');
    allow_limiting  = !$('#limiting').prop('checked');
    any_tanks       = $('#littletanks').prop('checked');
    body            = $('#refbody').val();

    max_thrust_ratio = 25;
    g0 = bodies[body].gravity;

    results = [];

    ['LF/O', 'mono'].forEach(function (type) {
        prefuel = 0;
        if (type === 'mono') {
            prefuel = payloadmono * 0.004;
        }
        engines = [];
        tanks = [new Part(type, "DUMMY TANK", 4, false, 0, 0, 0, 0, 0, 0, 0, [])];

        // Construct the set of engines and tanks to consider
        select_parts(all_engines, engines, type, function (part) { return !gimbal || part.gimbal > 0; });
        select_parts(all_tanks, tanks, type, function (part) { return true; });

        // Solve!
        results = results.concat(solve(payload-prefuel, prefuel, dv, twr * g0, atmo, max_engines, max_thrust_ratio, allow_deadend, allow_shutdown, allow_limiting, any_tanks, engines, tanks));
    });

    // Set awards
    if (results.length > 0) {
        awards.forEach(function (award) {
            var best, best_score = award.initial;
            results.forEach(function (rocket) {
                var score = award.lookup(rocket);
                // In the event of a tie, take the first one, esp important for
                // monoprop engines with zero mass, take the case with fewer
                // engines.
                if (score != best_score && score === award.reduce(score, best_score)) {
                    best = rocket;
                    best_score = score;
                }
            });
            best.awards.push(award);
        });

        results = results.filter(function (x) { return x.awards.length > 0; });
    }


    // Generate output html
    html = "<div class='header'><h4 class='text-muted'>Rockets</h3></div>";

    if (results.length === 0) {
        html += '<div class="alert alert-danger h3" role="alert">No Solutions <small>even Kerbal science has its limits</small></div>';
    }

    results.forEach(function (r) {
        html += "<div class='panel panel-default panel-primary'><div class='panel-heading'><strong>";

        r.engine_counts.forEach(function (e) {
            var limit = Math.floor(e.limit * 200 + 0.5) / 2;
            html += e.count + 'x ' + e.engine.name;
            if (limit !== 100) {
                html += ' (Thrust Limiter: ' + limit + '%)';
            }
            html += "<br/>";
        });

        if (r.tank.name !== "DUMMY TANK") {
            html += r.tank_count + 'x ' + r.tank.name;
        }

        html += "</strong></div>";
        html += '<div class="table-responsive"><table class="table"><thead><tr> <th>Total Δv</th> <th>Funds</th> <th>Wet Mass</th> <th>Dry Mass</th> </tr></thead> <tbody><tr>';

        html += '<td>' + r.dv.toFixed(2) + ' m/s</td>';
        html += '<td>' + r.cost + '</td>';
        html += '<td>' + r.mass.toFixed(2) + ' t</td>';
        html += '<td>' + (r.mass - r.fuel_mass).toFixed(2) + ' t</td>';

        html += '</tr></tbody></table></div>';
        html += '<br/>';

        html += '<div class="table-responsive"><table class="table"><thead><tr> <th>Phase</th> <th>Phase Δv</th> <th>TWR</th> <th>Fuel Burned</th> <th>Burn Time</th> <th>Shutdown Mass</th> </tr></thead> <tbody>';
        r.shutdown.forEach(function (s, i) {
            html += '<tr><td>' + (i + 1) + '</td>';
            html += '<td>' + s.stage_dv.toFixed(2) + ' m/s</td>';
            html += '<td>' + (s.init_TWRg / g0).toFixed(2) + ' (' + (s.end_TWRg / g0).toFixed(2) + ' max)</td>';
            html += '<td>' + (s.init_mass - s.end_mass).toFixed(2) + ' t</td>';
            html += '<td>' + s.burn_time.toFixed(2) + ' s </td>';
            html += '<td>' + s.end_mass.toFixed(2) + ' t </td></tr>';

            if (s.engine) {
                html += '<tr class="danger"><td></td><td class="danger" colspan="5"> Shutdown <strong>' + s.count + 'x ' + s.engine.name + '</strong></td></tr>';
            }
        });

        html += "</table></div><ul class='list-group'>";

        r.awards.forEach(function (award) {
            html += "<li class='list-group-item list-group-item-info'>" + award.name + "</li>";
        });

        html += "</ul></div>";
    });

    $('#results').html(html);
    // setTimeout was needed to stop jquery from doing the animation wrong when
    // the script takes longer than the animation
    setTimeout(function () { $('#results').animate({height: 'show'}, 300); }, 0);
}

function generate_results() {
    $('#results').animate({height: 'hide'}, 300, generate_results_inner);
}

$(document).ready(function () {
    // Initialize reference bodies
    $.each(bodies, function (k, v) {
        $('#refbody').append($("<option></option>").prop("value", k).text(k));
    });

    function initalize_checkboxlist(data, key) {
        var html = '<ul>';
        $.each(data, function (k, v) {
            html += '<li><label class="checkbox" for="' + key + '-' + k + '"> <input name="' + key + 's" id="' + key + '-' + k + '" value="' + k + '" type="checkbox">' + k + '</label><ul>';

            v.forEach(function (part, i) {
                html += '<li><label class="checkbox" for="' + key + '-' + k + i + '"> <input name="' + key + 's" id="' + key + '-' + k + i + '" value="' + part.name + '" type="checkbox">' + part.name + '</label></li>';
                part.selector = '#' + key + '-' + k + i;
            });

            html += '</ul></li>';
        });
        html += '</ul>';
        $('#' + key + '-checklist').html(html);
    }
    // Initalize Engines and Tanks
    initalize_checkboxlist(all_engines, 'engine');
    initalize_checkboxlist(all_tanks, 'tank');

    // Enable nested checkboxes
    $.extend($.expr[':'], {
        unchecked: function (obj) {
            return ((obj.type === 'checkbox' || obj.type === 'radio') && !$(obj).is(':checked'));
        }
    });

    $(".nestedcb input:checkbox").change(function () {
        $(this).parent().next('ul').find('label > input:checkbox').prop('checked', $(this).prop('checked'));

        // FIXME: not working, when a checkbox chages, make sure all parents are correct
        /*
         * for (var i = $('.nestedcb').find('ul').length - 1; i >= 0; i -= 1) {
         *     $('.nestedcb').find('ul:eq(' + i + ')').prev('label > input:checkbox').prop('checked', function () {
         *         return $(this).parent().next('ul').find('label > input:unchecked').length === 0 ? true : false;
         *     });
         * }
         */
    });

    // Make advanced options easier to click
    $('#advanced-options-toggle').click(function () { $('#advanced-options').collapse('toggle'); });
    var hoverstate;
    $('#advanced-options-toggle').hover(
        function () {
            var link = $('a[href="#advanced-options"]');
            hoverstate = link.css('text-decoration');
            link.css('text-decoration', 'underline');
        },
        function () {
            var link = $('a[href="#advanced-options"]');
            link.css('text-decoration', hoverstate);
        }
    );


    // Form validation
    $('#refbody').change(function () {
        $('#deltav').val(bodies[$('#refbody').val()].dv);
        $('#atmo').val(bodies[$('#refbody').val()].atmo / 2);
        $('#deltav').parents('.form-group').removeClass('has-error');
        $('#atmo').parents('.form-group').removeClass('has-error');

        if (bodies[$('#refbody').val()].atmo > 0) {
            $('#refbody').parents('.form-group').addClass('has-warning');
        } else {
            $('#refbody').parents('.form-group').removeClass('has-warning');
        }
    });

    ['#payload', '#deltav', '#twr', '#payloadmono'].forEach(function (x) {
        $(x).change(function () {
            if (parseFloat($(x).val()) > 0) {
                $(x).parents('.form-group').removeClass('has-error');
            } else {
                $(x).parents('.form-group').addClass('has-error');
            }
        });
    });

    $('#atmo').change(function () {
        var d = parseFloat($('#atmo').val());
        if (d >= 0 && d <= 100) {
            $('#atmo').parents('.form-group').removeClass('has-error');
        } else {
            $('#atmo').parents('.form-group').addClass('has-error');
        }
    });

    $('#maxengines').change(function () {
        var e = parseInt($('#maxengines').val(), 10);
        if (e > 0 && e < 7) {
            $('#maxengines').parents('.form-group').removeClass('has-error');
            $('#maxengines').parents('.form-group').removeClass('has-warning');
        } else if (e > 6 && e < 9) {
            $('#maxengines').parents('.form-group').removeClass('has-error');
            $('#maxengines').parents('.form-group').addClass('has-warning');
        } else {
            $('#maxengines').parents('.form-group').removeClass('has-warning');
            $('#maxengines').parents('.form-group').addClass('has-error');
        }
    });

    // Set defaults on load
    $('#refbody option[value="Mun"]').prop('selected', 'selected');
    $('#deltav').val(bodies[$('#refbody').val()].dv);
    $('#atmo').val(bodies[$('#refbody').val()].atmo / 2);
    $('#payload').val("1");
    $('#twr').val("2.0");
    $('#maxengines').val("3");
    $('#payloadmono').val("0");
    $('#engine-Stock').prop('checked', true).trigger('change');
    $('#tank-Stock').prop('checked', true).trigger('change');
});
