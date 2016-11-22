'use strict';

var Utils = {
    randomInt: function (low, high) {
        return Math.floor(Math.random() * (high - low)) + low;
    },

    createContext: function (selector, width, height) {
        var margin = {
            top: 40,
            left: 40,
            bottom: 20,
            right: 20
        };

        var svg = d3.select(selector)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        var chart = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ' ' + margin.top + ')');

        return {
            svg: svg,
            chart: chart,
            size: {
                width: width - margin.left - margin.right,
                height: height - margin.top - margin.bottom
            },
            margin: margin
        };
    },

    fadeOut: function (selection) {
        return selection.transition().duration(500).style('opacity', 0);
    },

    fadeIn: function (selection) {
        return selection.transition().duration(500).style('opacity', 1);
    },

    centerOfLargestArea: function (stack, threshold) {
        var bestStart, bestEnd, bestArea, bestMidpoint,
            inArea = false, newStart, newArea = 0, newMidpoint = 0;
        
        for (var i = 0; i < stack.length; i++) {
            var distance = stack[i][1] - stack[i][0];
            
            if (!inArea && distance > threshold) {
                newStart = i;
                inArea = true;
            } else if (inArea && (distance <= threshold || i == stack.length - 1)) {
                if (bestStart === undefined || newArea > bestArea) {
                    bestStart = newStart;
                    bestEnd = i;
                    bestArea = newArea;
                    bestMidpoint = Math.floor(newMidpoint / newArea);

                    newArea = newMidpoint = 0;
                }
                inArea = false;
            }

            if (inArea) {
                newArea += distance;
                newMidpoint += i * distance;
            }
        }

        if (bestStart !== undefined) {
            return {
                x: bestMidpoint,
                y: (stack[bestMidpoint][0] + stack[bestMidpoint][1]) / 2
            };
        }
    },

    dateFromMinute: function (minute) {
        return d3.timeMinute.offset(new Date(2001, 6, 4, 4), minute);
    },

    dateFromDayOfWeek: function (dayOfWeek) {
        return d3.timeDay.offset(new Date(2001, 6, 1, 0), dayOfWeek);
    },

    dateFromDayOfYear: function (dayOfYear) {
        return d3.timeDay.offset(new Date(2001, 0, 1, 0), dayOfYear);
    },

    extractData: function (data, timeMap) {
        var result = {},
            demographics = [],
            activities = [];

        for (var i = 0; i < data.columns.length; i++) {
            var parts = data.columns[i].split(':');
            if (parts.length < 2) continue;
            
            var demographic = parts[0],
                activity = parts[1];
            
            if (demographics.indexOf(demographic) == -1) {
                demographics.push(demographic);
                result[demographic] = [];
            }
            if (activities.indexOf(activity) == -1) activities.push(activity);
        }

        data.forEach(function (d, i) {
            demographics.forEach(function (demographic) {
                var row = {};
                activities.forEach(function (activity) {
                    var key = demographic + ':' + activity;
                    row[activity] = d[key];
                });
                row.date = timeMap(i);
                result[demographic].push(row);
            });
        });

        var ordering = [];
        var stack = d3.stack()
            .order(function (series) {
                ordering = d3.stackOrderDescending(series);
                return ordering;
            })
            .keys(activities)
        stack(result.all);
        stack.order(function (series) { return ordering; });

        demographics.forEach(function (demographic) {
            result[demographic] = stack(result[demographic]);
        });
        
        return result;
    },

    combineData: function (dayData, weekData, yearData, ageData) {
        return {
            day: Utils.extractData(dayData, Utils.dateFromMinute),
            week: Utils.extractData(weekData, Utils.dateFromDayOfWeek),
            year: Utils.extractData(yearData, Utils.dateFromDayOfYear),
            age: Utils.extractData(ageData, function (i) { return i + 15; })

        };
    }
};

var DotSlider = {
    create: function () {
        var result = Object.create(DotSlider);
        result.dispatch = d3.dispatch('change');
        return result;
    },

    size: function (width, height) {
        if (width && height) {
            this.size = [width, height];
            return this;
        } else {
            return this.size;
        }
    },

    domain: function (values) {
        if (values) {
            this.values = values;
            return this;
        } else {
            return this.values;
        }
    },

    element: function (selection) {
        if (selection) {
            this.selection = selection;
            var padding = this.size[0] / this.values.length,
                halfHeight = this.size[1] / 2;

            selection.attr('class', 'dotslider')
                .append('line')
                .attr('class', 'axis')
                .attr('x1', 0)
                .attr('x2', this.size[0])
                .attr('y1', halfHeight)
                .attr('y2', halfHeight);

            var stops = selection.selectAll('.stop')
                .data(this.values)
                .enter()
                .append('g')
                .attr('class', 'stop')
                .attr('transform', function (d, i) {
                    return 'translate(' + (padding * (i + 1 / 2)) + ' ' + halfHeight + ')';
                });
            stops.append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', 5)
                .on('mouseover', function () {
                    d3.select(this)
                        .transition()
                        .attr('r', 7);
                })
                .on('mouseout', function () {
                    d3.select(this)
                        .transition()
                        .attr('r', 5);
                });
            stops.append('text')
                .attr('x', 0)
                .attr('y', -10)
                .text(function (d) { return d; });

            var mark = selection.append('circle')
                .attr('class', 'mark')
                .attr('cx', padding / 2)
                .attr('cy', halfHeight)
                .attr('r', 5);

            var self = this;
            stops.on('click', function (d, i) {
                mark.transition()
                    .attr('cx', padding * (i + 1 / 2));
                self.dispatch.call('change', this, d, i);
            });
            return this;
        } else {
            return this.selection;
        }
    },

    on: function (event, callback) {
        return this.dispatch.on(event, callback);
    }
};

var State = {
    selectedActivity: undefined,
    timescale: 'day'
};

var Chart = {
    initializeAxes: function (context) {
        context.axes = {
            x: context.chart.append('g')
                .attr('transform', 'translate(0 ' + context.size.height + ')'),
            y: context.chart.append('g')
        };
    },

    xAxisFor: function (timescale, context) {
        switch (timescale) {
            case 'day':
                context.x = d3.scaleTime()
                    .domain([new Date(2001, 6, 4, 4), new Date(2001, 6, 5, 4)])
                    .range([0, context.size.width]);
                context.x.axis = d3.axisBottom(context.x)
                    .tickFormat(d3.timeFormat('%I %p'))
                    .ticks(d3.timeHour.every(2));
                break;
            case 'week':
                context.x = d3.scaleTime()
                    .domain([new Date(2001, 6, 1, 0), new Date(2001, 6, 7, 0)])
                    .range([0, context.size.width]);
                context.x.axis = d3.axisBottom(context.x)
                    .tickFormat(d3.timeFormat('%a'))
                    .ticks(d3.timeDay.every(1));
                break;
            case 'year':
                context.x = d3.scaleTime()
                    .domain([new Date(2001, 0, 1, 0), new Date(2001, 11, 31)])
                    .range([0, context.size.width]);
                context.x.axis = d3.axisBottom(context.x)
                    .tickFormat(d3.timeFormat('%B'))
                    .ticks(d3.timeMonth.every(1));
                break;
            case 'age':
                context.x = d3.scaleLinear()
                    .domain([15, 80])
                    .range([0, context.size.width]);
                context.x.axis = d3.axisBottom(context.x);
                break;
        }
    },

    transitionXAxis: function (context) {
        context.axes.x.transition()
            .duration(1000)
            .call(context.x.axis);
    }
}

function run() {
    var context = Utils.createContext('#content', 960, 500);
    
    var y = d3.scaleLinear()
        .domain([0, 1])
        .range([context.size.height, 0]);
    y.axis = d3.axisLeft(y)
        .tickFormat(function (d) {
            return Math.abs(Math.floor(d * 100) - d * 100) < .001 ? d3.format('.0%')(d) : d3.format('.1%')(d);
        });

    var z = d3.scaleOrdinal(d3.schemeCategory20);

    var area = d3.area()
        .x(function (d) { return context.x(d.data.date); })
        .y0(function (d) { return y(d[0]); })
        .y1(function (d) { return y(d[1]); });

    var singleArea = d3.area()
        .x(function (d) { return context.x(d.data.date); })
        .y0(function (d) { return y(0); })
        .y1(function (d) { return y(d[1] - d[0]); });

    d3.queue()
        .defer(d3.csv, 'day.csv')
        .defer(d3.csv, 'week.csv')
        .defer(d3.csv, 'year.csv')
        .defer(d3.csv, 'age.csv')
        .await(function (error, dayData, weekData, yearData, ageData) {
            if (error) {
                console.error(error);
                return;
            }

            var data = Utils.combineData(dayData, weekData, yearData, ageData);

            Chart.initializeAxes(context);
            context.chart.append('g').attr('class', 'layer');

                var slider = DotSlider.create()
                .domain(['Day', 'Week', 'Year', 'Lifetime'])
                .size(960, 50)
                .element(context.svg.append('g'))
                .on('change', function (d, i) {
                    changeTimescale(d === 'Lifetime' ? 'age' : d.toLowerCase());
                });

            function changeTimescale (timescale) {
                State.timescale = timescale;
                Chart.xAxisFor(timescale, context);
                Chart.transitionXAxis(context);
                
                var n = 0;
                Utils.fadeOut(context.chart.selectAll('.layer'))
                    .each(function () { n++; })
                    .remove()
                    .on('end', function () {
                        n--;
                        if (n > 0) return;

                        var layer = context.chart.selectAll('.layer')
                            .data(data[timescale].all)
                            .enter()
                            .append('g')
                            .attr('class', 'layer');
                        
                        layer.append('path')
                            .attr('class', 'area')
                            .style('fill', function (d) { return z(d.key); })
                            .style('opacity', 0)
                            .attr('d', area)
                            .call(Utils.fadeIn);
                        
                        layer
                            .on('mouseover', function () {
                                var self = this;
                                d3.select('#helptext').text(
                                    d3.select(this).data()[0].key
                                );
                                layer.selectAll('.area')
                                    .filter(function () { return !self.contains(this); })
                                    .transition()
                                    .style('fill', function (d) {
                                        var color = d3.hsl(z(d.key));
                                        color.s = 0;
                                        return color;
                                    });
                            })
                            .on('click', function () {
                                var activity = d3.select(this).data()[0].key;
                                var self = this;

                                if (State.selectedActivity === activity) {
                                    y.domain([0, 1]);
                                    context.axes.y
                                        .transition()
                                        .duration(1000)
                                        .call(y.axis);
                                    d3.select(this).select('.area')
                                        .transition('shape')
                                        .duration(1000)
                                        .attr('d', singleArea)
                                        .transition()
                                        .duration(1000)
                                        .attr('d', area);
                                    layer.filter(function () { return this !== self; })
                                        .select('.area')
                                        .attr('d', area);
                                    layer.transition()
                                        .delay(1800)
                                        .duration(500)
                                        .style('opacity', 1)
                                        .style('pointer-events', 'visiblePainted');
                                    State.selectedActivity = undefined;
                                } else {
                                    layer.filter(function () { return this !== self; })
                                        .style('pointer-events', 'none')
                                        .call(Utils.fadeOut);
                                    d3.select(this).select('.area')
                                        .transition('shape')
                                        .delay(300)
                                        .duration(1000)
                                        .attr('d', singleArea)
                                        .on('end', function () {
                                            y.domain([0, d3.max(
                                                d3.select(this).data()[0],
                                                function (d) {
                                                    return d[1] - d[0];
                                                }
                                            )]);
                                            context.axes.y
                                                .transition()
                                                .duration(1000)
                                                .call(y.axis);
                                            d3.select(this)
                                                .transition('shape')
                                                .duration(1000)
                                                .attr('d', singleArea);
                                        });
                                    State.selectedActivity = activity;
                                }
                            });
                        
                        context.chart.on('mouseout', function () {
                            layer.selectAll('path')
                                .transition()
                                .style('fill', function (d) { return z(d.key); });
                        });
                    });
            }

            d3.select('#demographics')
                .selectAll('a')
                .data(Object.keys(data['day']))
                .enter()
                .append('a')
                .attr('href', '#')
                .text(function (d) { return d + ' '; })
                .on('click', function (d) {
                    context.chart.selectAll('.layer')
                        .data(data[State.timescale][d])
                        .select('.area')
                        .transition('shape')
                        .duration(1000)
                        .attr('d', State.selectedActivity ? singleArea : area);
                });

            changeTimescale(State.timescale);
            context.axes.y.call(y.axis);

            // layer.filter(function (d) { return d.center !== undefined; })
            //     .append('text')
            //     .attr('x', function (d) { return x(Utils.dateFromMinute(d.center.x)); })
            //     // .attr('x', function (d) { return x(Utils.dateFromDayOfWeek(d.center.x)); })
            //     // .attr('x', function (d) { return x(Utils.dateFromDayOfYear(d.center.x)); })
            //     // .attr('x', function (d) { return x(d.center.x); })
            //     .attr('y', function (d) { return y(d.center.y); })
            //     .attr('dy', '.35em')
            //     .style('text-anchor', 'middle')
            //     .style('font', '10px sans-serif')
            //     .text(function (d) { return d.key; });

            
        });
}

document.addEventListener('DOMContentLoaded', run);
