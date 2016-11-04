import sys
import json
import csv

def minutes(time):
    result = int(time[0:2]) * 60 + int(time[3:5]) - 4 * 60
    if result < 0:
        result += 24 * 60
    return result

def load_json(path):
    with open(path) as data:
        return json.load(data)

def flatten(input, fields):
    context = {}
    for line in input:
        record_type = int(line[0]) - 1
        values = {
            key: line[range[0] - 1 : range[1]]
            for key, range in fields[record_type].items()
        }
        context.update(values)
        if record_type == 2:
            yield context

def in_bin(test, record):
    if type(test) == bool:
        return test
    elif type(test) == dict:
        result = True
        for field, value in test.items():
            if type(value) == str:
                if value[0] == '!':
                    result = result and (record[field] != value[1:])
                else:
                    result = result and (record[field] == value)
            elif type(value) == list:
                numeric_value = int(record[field])
                result = result and (value[0] <= numeric_value <= value[1])
            else:
                raise 'Unknown bin test'
        return result
    else:
        raise 'Unknown bin test'

def normalize(counts):
    for row in counts:
        for bin in row:
            total = sum(bin)
            if total == 0:
                continue
            for i in range(len(bin)):
                bin[i] /= total

def write(path, counts, title, bins, activities):
    with open(path, 'w') as output:
        columns = [title] + ['{}:{}'.format(bin, name) for bin, _ in bins for name, _ in activities]
        writer = csv.writer(output, lineterminator='\n')
        writer.writerow(columns)

        for i, row in enumerate(counts):
            writer.writerow([i] + ["{0:.5f}".format(value) for bin in row for value in bin])

def run():
    config = load_json('config.json')
    bins = list(config['bins'].items())
    activities = list(config['activities'].items())
    fields = config['fields']
    
    day_counts = [[[0] * len(activities) for _ in range(len(bins))] for _ in range(60 * 24)]
    week_counts = [[[0] * len(activities) for _ in range(len(bins))] for _ in range(7)]

    c = 0
    with open('raw_data.dat') as input:
        for record in flatten(input, fields):
            c += 1
            if c % 100000 == 0:
                print('Processed', c, 'records')

            activity = int(record['ACTIVITY'])
            start = minutes(record['START'])
            stop = minutes(record['STOP'])
            duration = stop - start
            if duration < 0:
                duration += 24 * 60
            day_of_week = int(record['DAY']) - 1
            weight = float(record['WT06'])

            for i, (_, codes) in enumerate(activities):
                if codes[0] <= activity <= codes[1]:
                    for j, (_, test) in enumerate(bins):
                        if in_bin(test, record):
                            if (stop < start):
                                for minute in range(start, 60 * 24):
                                    day_counts[minute][j][i] += weight
                                for minute in range(0, stop):
                                    day_counts[minute][j][i] += weight
                            else:
                                for minute in range(start, stop):
                                    day_counts[minute][j][i] += weight
                            if day_of_week < 7:
                                week_counts[day_of_week][j][i] += weight * duration

    normalize(day_counts)
    normalize(week_counts)

    write('day_demo.csv', day_counts, 'Minute', bins, activities)
    write('week_demo.csv', week_counts, 'Day', bins, activities)