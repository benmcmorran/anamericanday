'use strict';

var Utils = {
    randomInt: function (low, high) {
        return Math.floor(Math.random() * (high - low)) + low;
    },

    createContext: function (selector, width, height) {
        var margin = {
            top: 20,
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

    countdownCallback: function (count, callback) {
        var cnt = count;
        return function () {
            cnt--;
            if (cnt === 0) {
                callback();
            }
        };
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
        return d3.timeMinute.offset(new Date(2000, 0, 2, 4), minute);
    },

    dateFromDayOfWeek: function (dayOfWeek) {
        return d3.timeDay.offset(new Date(2000, 0, 2, 0), dayOfWeek);
    },

    dateFromDayOfYear: function (dayOfYear) {
        return d3.timeDay.offset(new Date(2001, 0, 1, 0), dayOfYear);
    }
};

var State = {
    selectedActivity: undefined
};

function run() {
    var context = Utils.createContext('#content', 960, 500);

    var x = /*d3.scaleTime()*/d3.scaleLinear()
        // .domain([new Date(2000, 0, 2, 4), new Date(2000, 0, 3, 4)])
        // .domain([new Date(2000, 0, 2, 0), new Date(2000, 0, 8, 0)])
        // .domain([new Date(2001, 0, 1, 0), new Date(2001, 11, 31)])
        .domain([15, 80])
        .range([0, context.size.width]);
    
    var y = d3.scaleLinear()
        .domain([0, 1])
        .range([context.size.height, 0]);

    var z = d3.scaleOrdinal(d3.schemeCategory20);

    var stack = d3.stack()
        .order(d3.stackOrderDescending);

    var area = d3.area()
        .x(function (d) { return x(d.data.date); })
        .y0(function (d) { return y(d[0]); })
        .y1(function (d) { return y(d[1]); });

    var singleArea = d3.area()
        .x(function (d) { return x(d.data.date); })
        .y0(function (d) { return y(0); })
        .y1(function (d) { return y(d[1] - d[0]); });

    d3.csv(
        'age.csv',
        function (d, i, columns) {
            // d.date = Utils.dateFromMinute(+d.Minute);
            // d.date = Utils.dateFromDayOfWeek(+d.Day);
            // d.date = Utils.dateFromDayOfYear(+d.Day);
            d.date = +d.Age;
            for (var i = 0; i < columns.length; i++) {
                d[columns[i]] = +d[columns[i]];
            }
            return d;
        },
        function (error, data) {
            if (error) throw error;

            var keys = data.columns.filter(function (d) {
                return d.startsWith('all');
            });
            z.domain(keys);
            stack.keys(keys);
            var stackedData = stack(data);
            stackedData = stackedData.map(function (d) {
                d.center = Utils.centerOfLargestArea(d, .02);
                return d;
            });

            var layer = context.chart.selectAll('.layer')
                .data(stackedData)
                .enter()
                .append('g')
                .attr('class', 'layer');

            layer.append('path')
                .attr('class', 'area')
                .style('fill', function (d) { return z(d.key); })
                .attr('d', area);

            x.axis = d3.axisBottom(x)
                // .tickFormat(d3.timeFormat('%I %p'))
                // .ticks(d3.timeHour.every(2));
                // .tickFormat(d3.timeFormat('%a'))
                // .ticks(d3.timeDay.every(1));
                // .tickFormat(d3.timeFormat('%B'))
                // .ticks(d3.timeMonth.every(1));
            x.axisSelection = context.chart.append('g')
                .attr('transform', 'translate(0 ' + context.size.height + ')')
                .call(x.axis);

            y.axis = d3.axisLeft(y)
                .tickFormat(d3.format('.0%'));
            y.axisSelection = context.chart.append('g')
                .call(y.axis);

            layer.filter(function (d) { return d.center !== undefined; })
                .append('text')
                // .attr('x', function (d) { return x(Utils.dateFromMinute(d.center.x)); })
                // .attr('x', function (d) { return x(Utils.dateFromDayOfWeek(d.center.x)); })
                // .attr('x', function (d) { return x(Utils.dateFromDayOfYear(d.center.x)); })
                .attr('x', function (d) { return x(d.center.x); })
                .attr('y', function (d) { return y(d.center.y); })
                .attr('dy', '.35em')
                .style('text-anchor', 'middle')
                .style('font', '10px sans-serif')
                .text(function (d) { return d.key; });

            layer
                .on('mouseover', function () {
                    var self = this;
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

                    if (State.selectedActivity === activity) {
                        y.domain([0, 1]);
                        y.axisSelection
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
                        layer.transition()
                            .delay(1800)
                            .duration(500)
                            .style('opacity', 1)
                            .style('pointer-events', 'visiblePainted')
                        State.selectedActivity = undefined;
                    } else {
                        var self = this;
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
                                y.axisSelection
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
        }
    );
}

document.addEventListener('DOMContentLoaded', run);
