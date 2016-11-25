'use strict';

var Timescale = {
    DAY: 'Day',
    WEEK: 'Week',
    YEAR: 'Year',
    LIFETIME: 'Lifetime',
    values: ['Day', 'Week', 'Year', 'Lifetime']
};

var Utils = {
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

    dateToIndex: function (timescale, time) {
        switch (timescale) {
            case Timescale.DAY:
                return d3.timeMinute.count(new Date(2001, 6, 4, 4), time);
            case Timescale.WEEK:
                return d3.timeDay.count(new Date(2001, 6, 1, 0), time);
            case Timescale.YEAR:
                return d3.timeDay.count(new Date(2001, 0, 1, 0), time);
            case Timescale.LIFETIME:
                return Math.floor(time - 15);
        }
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
        var result = {};
        result[Timescale.DAY] = Utils.extractData(dayData, Utils.dateFromMinute);
        result[Timescale.WEEK] = Utils.extractData(weekData, Utils.dateFromDayOfWeek);
        result[Timescale.YEAR] = Utils.extractData(yearData, Utils.dateFromDayOfYear);
        result[Timescale.LIFETIME] = Utils.extractData(ageData, function (i) { return i + 15; });
        return result;
    }
};

var DotSlider = {
    create: function () {
        var result = Object.create(DotSlider);
        result._dispatch = d3.dispatch('change');
        return result;
    },

    domain: function (domain) {
        if (domain) {
            this._domain = domain;
            return this;
        } else {
            return this._domain;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            var padding = this._size[0] / this._domain.length,
                halfHeight = this._size[1] / 2;

            element.attr('class', 'dotslider')
                .append('line')
                .attr('class', 'axis')
                .attr('x1', 0)
                .attr('x2', this._size[0])
                .attr('y1', halfHeight)
                .attr('y2', halfHeight);

            var stops = element.selectAll('.stop')
                .data(this._domain)
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

            var mark = element.append('circle')
                .attr('class', 'mark')
                .attr('cx', padding / 2)
                .attr('cy', halfHeight)
                .attr('r', 5);

            var self = this;
            stops.on('click', function (d, i) {
                mark.transition()
                    .attr('cx', padding * (i + 1 / 2));
                self._dispatch.call('change', this, d, i);
            });
            return this;
        } else {
            return this._element;
        }
    },

    on: function (event, callback) {
        return this._dispatch.on(event, callback);
    }
};

var AreaChart = {
    create: function () {
        var result = Object.create(AreaChart);
        result._dispatch = d3.dispatch('cursorChanged', 'hoverActivityChanged', 'activityClicked');
        return result;
    },

    data: function (data) {
        if (data) {
            this._data = data;
            return this;
        } else {
            return this._data;
        }
    },

    timescale: function (timescale) {
        if (timescale) {
            var oldTimescale = this._timescale;
            this._timescale = timescale;

            if (this._element && oldTimescale !== timescale) {
                if (this._selectedActivity) {
                    this.resetYAxis();
                    this._selectedActivity = null;
                }
                this._x = this.generateX();
                this._xAxis = this.generateXAxis();
                var self = this;

                if (oldTimescale !== Timescale.LIFETIME && timescale !== Timescale.LIFETIME) {
                    this._xSelection.transition()
                        .duration(500)
                        .call(this._xAxis);
                } else {
                    this._xSelection.transition()
                        .style('opacity', 0)
                        .on('end', function () {
                            self._xSelection
                                .call(self._xAxis)
                                .transition()
                                .style('opacity', 1);
                        });
                }

                this._layerContainer.transition()
                    .style('opacity', 0)
                    .on('end', function () {
                        self._layers = self.generateStackedLayers();
                        self._layerContainer.transition()
                            .style('opacity', 1);
                    });
            }
            return this;
        } else {
            return this._timescale;
        }
    },

    selectedActivity: function (activity) {
        if (activity !== undefined) {
            var self = this;
            if (!activity) {
                this._y.domain([0, 1]);
                this._ySelection
                    .transition()
                    .duration(1000)
                    .call(this._yAxis);
                this._layers.filter(function (d) {
                        return d.key === self._selectedActivity;
                    })
                    .select('.area')
                    .transition()
                    .duration(1000)
                    .attr('d', this._singleArea)
                    .transition()
                    .duration(1000)
                    .attr('d', this._area);
                this._layers.filter(function (d) {
                        return d.key !== self._selectedActivity;
                    })
                    .transition()
                    .delay(1800)
                    .duration(500)
                    .style('opacity', 1)
                    .style('pointer-events', 'visiblePainted');
            } else if (this._selectedActivity !== activity) {
                this._layers.filter(function (d) {
                        return d.key !== activity;
                    })
                    .style('pointer-events', 'none')
                    .transition()
                    .duration(500)
                    .style('opacity', 0);
                this._layers.filter(function (d) {
                        return d.key === activity;
                    })
                    .select('.area')
                    .transition()
                    .delay(300)
                    .duration(1000)
                    .attr('d', this._singleArea)
                    .on('end', function () {
                        self._y.domain([0, d3.max(
                            d3.select(this).data()[0],
                            function (d) {
                                return d[1] - d[0];
                            }
                        )]);
                        self._ySelection
                            .transition()
                            .duration(1000)
                            .call(self._yAxis);
                        d3.select(this)
                            .transition()
                            .duration(1000)
                            .attr('d', self._singleArea);
                    });
            }
            this._selectedActivity = activity;
            return this;
        } else {
            return this._selectedActivity;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            this._innerSize = [this._size[0] - 50, this._size[1] - 20];
            this._chart = element.append('g')
                .attr('transform', 'translate(40 0)')
                .attr('class', 'areachart');

            // Add the layer container first so that the axes are always on top
            this._layerContainer = this._chart.append('g');

            this._y = d3.scaleLinear()
                .domain([0, 1])
                .range([this._innerSize[1], 0]);
            this._yAxis = d3.axisLeft(this._y)
                .tickFormat(function (d) {
                    return Math.abs(Math.floor(d * 100) - d * 100) < .001 ? d3.format('.0%')(d) : d3.format('.1%')(d);
                });
            this._ySelection = this._chart.append('g')
                .call(this._yAxis);
    
            this._x = this.generateX();
            this._xAxis = this.generateXAxis();
            this._xSelection = this._chart.append('g')
                .attr('transform', 'translate(0 ' + this._innerSize[1] + ')')
                .call(this._xAxis);
            
            this._z = d3.scaleOrdinal(d3.schemeCategory20);

            var self = this;

            this._area = d3.area()
                .x(function (d) { return self._x(d.data.date); })
                .y0(function (d) { return self._y(d[0]); })
                .y1(function (d) { return self._y(d[1]); });

            this._singleArea = d3.area()
                .x(function (d) { return self._x(d.data.date); })
                .y0(function (d) { return self._y(0); })
                .y1(function (d) { return self._y(d[1] - d[0]); });

            this._cursor = this._chart.append('line')
                .attr('class', 'cursor')
                .attr('y1', 0)
                .attr('y2', this._innerSize[1]);

            this._layerContainer
                .on('mousemove', function () {
                    var coords = d3.mouse(self._chart.node());
                    self._cursor
                        .attr('x1', coords[0])
                        .attr('x2', coords[0])
                        .style('display', 'inline');
                    var value = self._x.invert(coords[0]);
                    self._dispatch.call('cursorChanged', self, value);
                })
                .on('mouseout', function () {
                    self._cursor.style('display', 'none');
                    self._dispatch.call('cursorChanged', self, null);
                    self._dispatch.call('hoverActivityChanged', self, null);
                });

            this._layers = this.generateStackedLayers();

            return this;
        } else {
            return this._element;
        }
    },

    on: function (event, callback) {
        return this._dispatch.on(event, callback);
    },

    generateX: function () {
        var result;
        switch (this._timescale) {
            case Timescale.DAY:
                result = d3.scaleTime()
                    .domain([new Date(2001, 6, 4, 4), new Date(2001, 6, 5, 4)]);
                break;
            case Timescale.WEEK:
                result = d3.scaleTime()
                    .domain([new Date(2001, 6, 1, 0), new Date(2001, 6, 7, 0)]);
                break;
            case Timescale.YEAR:
                result = d3.scaleTime()
                    .domain([new Date(2001, 0, 1, 0), new Date(2001, 11, 31)]);
                break;
            case Timescale.LIFETIME:
                result = d3.scaleLinear().domain([15, 80]);
                break;
        }
        return result.range([0, this._innerSize[0]]);
    },

    generateXAxis: function () {
        var axis = d3.axisBottom(this._x);
        switch (this._timescale) {
            case Timescale.DAY:
                return axis.tickFormat(d3.timeFormat('%I %p'))
                    .ticks(d3.timeHour.every(2));
            case Timescale.WEEK:
                return axis.tickFormat(d3.timeFormat('%a'))
                    .ticks(d3.timeDay.every(1));
            case Timescale.YEAR:
                return axis.tickFormat(d3.timeFormat('%B'))
                    .ticks(d3.timeMonth.every(1));
            case Timescale.LIFETIME:
                return axis;
        }
    },

    generateStackedLayers: function () {
        var self = this;
        this._layerContainer.selectAll('.layer').remove();

        var layer = this._layerContainer.selectAll('.layer')
                .data(this._data[this._timescale].all)
                .enter()
                .append('g')
                .attr('class', 'layer');

        layer.append('path')
            .attr('class', 'area')
            .style('fill', function (d) { return self._z(d.key); })
            .attr('d', this._area);

        layer
            .on('mouseover', function (d) {
                self._dispatch.call('hoverActivityChanged', self, d.key);
            })
            .on('click', function (d) {
                self._dispatch.call('activityClicked', self, d.key);
            });

        return layer;
    },

    resetYAxis: function () {
        this._y.domain([0, 1]);
        this._ySelection.transition()
            .duration(500)
            .call(this._yAxis);
    }
};

var HoverDetails = {
    create: function () {
        var result = Object.create(HoverDetails);
        result._dispatch = d3.dispatch();
        return result;
    },

    timescale: function (timescale) {
        if (timescale) {
            this._timescale = timescale;
            return this;
        } else {
            return this._timescale;
        }
    },

    time: function (time) {
        // Explicity check for undefined because a null time indicates
        // that we are averaging across the time period
        if (time !== undefined) {
            this._time = time;
            this._header.text(this.generateHeaderText());
            this.updateBreakdown();
            return this;
        } else {
            return this._time;
        }
    },

    focusActivity: function (activity) {
        // Explicity check for undefined, null indicates no focus
        if (activity !== undefined) {
            this._focusActivity = activity;
            this.updateBreakdown();
            return this;
        } else {
            return this._focusActivity;
        }
    },

    data: function (data) {
        if (data) {
            this._data = data;
            return this;
        } else {
            return this._data;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            element.attr('class', 'details')
                // .append('rect')
                // .attr('width', this._size[0])
                // .attr('height', this._size[1])
                // .attr('fill', 'green');
            this._header = element.append('text')
                .attr('class', 'header')
                .attr('dy', '1em')
                .text(this.generateHeaderText());

            this._breakdownContainer = element.append('g')
                .attr('class', 'breakdown')
                .attr('transform', 'translate(0 40)');
            
            this.updateBreakdown();

            return this;
        } else {
            return this._element;
        }
    },

    generateHeaderText: function () {
        if (!this._time) {
            return "On an average day";
        }

        switch (this._timescale) {
            case Timescale.DAY:
                return 'At ' + d3.timeFormat('%I:%M %p')(this._time);
            case Timescale.WEEK:
                return 'On ' + d3.timeFormat('%A')(this._time);
            case Timescale.YEAR:
                return 'On ' + d3.timeFormat('%B %e')(this._time);
            case Timescale.LIFETIME:
                return 'At ' + Math.floor(this._time) + ' years old';
        }
    },

    updateBreakdown: function () {
        var self = this;
        this._breakdownContainer.selectAll('.measure').remove();

        var inputData = this._data[this._timescale].all;
        if (!self._time) {
            inputData = this._data[Timescale.DAY].all;
        }

        var data = inputData.map(function (d) {
            var value;
            if (!self._time) {
                value = d3.sum(d, function (e) { return e[1] - e[0]; });
                value /= 1440;
            } else {
                var index = Utils.dateToIndex(self._timescale, self._time);
                value = d[index][1] - d[index][0];
            }

            return {
                value: value,
                description: d.key 
            }
        });
        data = data.sort(function (a, b) {
            return b.value - a.value;
        });

        var measures = this._breakdownContainer.selectAll('.measure')
            .data(data);
        var newMeasures = measures.enter()
            .append('g')
            .attr('class', function (d) {
                return 'measure' + ((self._focusActivity === d.description) ? ' focused' : '');
            })
            .attr('transform', function (d, i) { return 'translate(0 ' + (i * 15) + ')' });
        newMeasures.append('text')
            .attr('class', 'value')
            .attr('x', 30)
            .text(function (d) { return d3.format('.1%')(d.value); });
        newMeasures.append('text')
            .attr('class', 'description')
            .attr('x', 40)
            .text(function (d) { return d.description; });
    }
};

var DemographicView = {
    create: function () {
        var result = Object.create(DemographicView);
        result._dispatch = d3.dispatch();
        return result;
    },

    timescale: function (timescale) {
        if (timescale) {
            this._timescale = timescale;
            return this;
        } else {
            return this._timescale;
        }
    },

    time: function (time) {
        // Explicity check for undefined because a null time indicates
        // that we are averaging across the time period
        if (time !== undefined) {
            this._time = time;
            return this;
        } else {
            return this._time;
        }
    },

    data: function (data) {
        if (data) {
            this._data = data;
            return this;
        } else {
            return this._data;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            element.attr('class', 'details')
                .append('rect')
                .attr('width', this._size[0])
                .attr('height', this._size[1])
                .attr('fill', 'green');
            return this;
        } else {
            return this._element;
        }
    }
};

function handleData (svg) {
    return function (error, dayData, weekData, yearData, ageData) {
        if (error) {
            console.error(error);
            return;
        }

        var data = Utils.combineData(dayData, weekData, yearData, ageData);

        var slider = DotSlider.create()
            .domain(Timescale.values)
            .size(960, 50)
            .element(svg.append('g'));

        var area = AreaChart.create()
            .data(data)
            .timescale(Timescale.DAY)
            .size(700, 450)
            .element(
                svg.append('g')
                    .attr('transform', 'translate(0 50)')
            );

        var details = HoverDetails.create()
            .data(data)
            .timescale(Timescale.DAY)
            .size(250, 450)
            .element(
                svg.append('g')
                    .attr('transform', 'translate(710 50)')
            );

        var demographics = DemographicView.create()
            .data(data)
            .timescale(Timescale.DAY)
            .size(700, 290)
            .element(
                svg.append('g')
                    .attr('transform', 'translate(0 510)')
            );

        slider.on('change', function (d) {
            area.timescale(d);
            details.timescale(d);
        });

        area
            .on('cursorChanged', function (value) {
                details.time(value);
            })
            .on('hoverActivityChanged', function (activity) {
                details.focusActivity(activity);
            })
            .on('activityClicked', function (activity) {
                if (area.selectedActivity()) {
                    area.selectedActivity(null);
                } else {
                    area.selectedActivity(activity);
                }
            });
    }
}

function run () {
    var svg = d3.select('#canvas')
        .append('svg')
        .attr('width', 960)
        .attr('height', 800);

    d3.queue()
        .defer(d3.csv, 'day.csv')
        .defer(d3.csv, 'week.csv')
        .defer(d3.csv, 'year.csv')
        .defer(d3.csv, 'age.csv')
        .await(handleData(svg));
}

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

function run2() {
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
