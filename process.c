#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>
#include <math.h>

#define MAX_LINE_SIZE 100
#define CASEID_START 1
#define CASEID_SIZE 14
#define WEIGHT_START 39
#define WEIGHT_SIZE 17
#define AGE_START 56
#define ACTIVITY_START 20
#define ACTIVITY_SIZE 6
#define START_START 26

#define MAX_DIARY_ENTRIES 100
#define MAX_DIARIES 200000

typedef struct {
    int start;
    int activity;
} Activity;

typedef struct {
    Activity values[MAX_DIARIES][MAX_DIARY_ENTRIES];
    int activityCounts[MAX_DIARIES];
    double weights[MAX_DIARIES];
    double totalDistance[MAX_DIARIES];
    int diaryCount;
} Diaries;

int add_diary(Diaries *diaries, double weight) {
    int result = diaries->diaryCount;
    diaries->weights[result] = weight;
    diaries->diaryCount++;
    return result;
}

void add_diary_activity(Diaries *diaries, int diaryIndex, Activity activity) {
    diaries->values[diaryIndex][diaries->activityCounts[diaryIndex]++] = activity;
}

double diary_distance(Diaries *diaries, int index1, int index2) {
    int i, j, last_update_time;
    i = j = last_update_time = 0;

    int length1 = diaries->activityCounts[index1];
    int length2 = diaries->activityCounts[index2];

    int activity1 = diaries->values[index1][0].activity;
    int activity2 = diaries->values[index2][0].activity;

    double distance = 0;

    while (i < length1 - 1 || j < length2 - 1) {
        int increment_i = 1;
        if (i == length1 - 1 || (j < length2 - 1 &&
            diaries->values[index1][i + 1].start > diaries->values[index2][j + 1].start)) {
            increment_i = 0;
        }

        if (increment_i) {
            i++;
            int startTime = diaries->values[index1][i].start;
            if (activity1 != activity2) {
                distance += startTime - last_update_time;
            }
            last_update_time = startTime;
            activity1 = diaries->values[index1][i].activity;
        } else {
            j++;
            int startTime = diaries->values[index2][j].start;
            if (activity1 != activity2) {
                distance += startTime - last_update_time;
            }
            last_update_time = startTime;
            activity2 = diaries->values[index2][j].activity;
        }
    }

    if (activity1 != activity2) {
        distance += 24 * 60 - last_update_time;
    }

    return distance;
}

typedef struct {
    char caseid[CASEID_SIZE];
    double weight;
    int age;
    int start;
    int activity;
} Record;

void fail(char *message) {
    perror(message);
    exit(1);
}

int minutes(char* timeString) {
    int hours = 10 * (timeString[0] - '0') + (timeString[1] - '0');
    int minutes = 10 * (timeString[3] - '0') + (timeString[4] - '0');

    hours -= 4;
    if (hours < 0) {
        hours += 24;
    }

    return 60 * hours + minutes;
}

int get_record(Record *lastRecord, char* line) {
    int recordType = line[0] - '0';
    char weight[WEIGHT_SIZE + 1] = { 0 };
    char activity[ACTIVITY_SIZE + 1] = { 0 };
    switch (recordType) {
        case 1:
            strncpy(lastRecord->caseid, &line[CASEID_START], CASEID_SIZE);
            break;
        case 2:
            strncpy(lastRecord->caseid, &line[CASEID_START], CASEID_SIZE);
            strncpy(weight, &line[WEIGHT_START], WEIGHT_SIZE);
            lastRecord->weight = atof(weight);
            lastRecord->age = (line[AGE_START + 1] - '0') * 10 + line[AGE_START + 2] - '0';
            break;
        case 3:
            strncpy(lastRecord->caseid, &line[CASEID_START], CASEID_SIZE);
            strncpy(activity, &line[ACTIVITY_START], ACTIVITY_SIZE);
            lastRecord->activity = atoi(activity);
            lastRecord->start = minutes(&line[START_START]);
            break;
    }
    return line[0] - '0';
}

int main(int argc, char *argv[]) {
    (void) argc;
    (void) argv;

    time_t startTime = time(NULL);
    srand(startTime);

    FILE *data = fopen("raw_data.dat", "r");
    if (NULL == data) {
        fail("Could not open data file");
    }

    Diaries *diaries = malloc(sizeof(Diaries));
    if (NULL == diaries) {
        fail("Could not allocate space for diaries");
    }
    memset(diaries, 0, sizeof(Diaries));

    Record record = { 0 };
    int diary = 0;
    int inDiary = 0;
    char line[MAX_LINE_SIZE] = { 0 };
    while (NULL != fgets(line, MAX_LINE_SIZE, data)) {
        switch (get_record(&record, line)) {
            case 2:
                if (rand() % 100 < 100) {
                    diary = add_diary(diaries, record.weight);
                    inDiary = 1;
                } else {
                    inDiary = 0;
                }
                break;
            case 3: {
                Activity activity = {
                    .start = record.start,
                    .activity = record.activity
                };
                if (inDiary) {
                    add_diary_activity(diaries, diary, activity);
                }
                break;
            }
        }
    }

    if (EOF == fclose(data)) {
        fail("Could not close data file");
    }

    printf("Added %d diaries\n", diaries->diaryCount);

    // long long totalComparisons = (1L + (long long)diaries->diaryCount) * (long long)diaries->diaryCount / 2L;
    // printf("Performing %I64d total comparisons\n", totalComparisons);
    // long long comparisons = 0;
    // for (int i = 0; i < diaries->diaryCount; i++) {
    //     for (int j = i; j < diaries->diaryCount; j++) {
    //         comparisons++;
    //         if ((comparisons % (totalComparisons / 100)) == 0 && totalComparisons > 150000000) {
    //             printf("%I64d comparisons complete\n", comparisons);
    //         }
    //         double distance = diary_distance(diaries, i, j);
    //         diaries->totalDistance[i] += diaries->weights[j] * distance;
    //         diaries->totalDistance[j] += diaries->weights[i] * distance;
    //     }
    // }

    // double minDistance = INFINITY;
    // int minIndex = 0;
    // for (int i = 0; i < diaries->diaryCount; i++) {
    //     double newDistance = diaries->totalDistance[i];
    //     if (newDistance < minDistance) {
    //         minDistance = newDistance;
    //         minIndex = i;
    //     }
    // }

    // printf("Minimum total distance: %f\n", minDistance);
    // printf("Medoid diary: ");
    // for (int i = 0; i < diaries->activityCounts[minIndex]; i++) {
    //     Activity activity = diaries->values[minIndex][i];
    //     printf("%d: %d, ", activity.start, activity.activity);
    // }
    // printf("\n");

    double monophasic, biphasic, polyphasic;
    monophasic = biphasic = polyphasic = 0;
    double totalWeight = 0;

    for (int i = 0; i < diaries->diaryCount; i++) {
        int sleepCount = 0;
        int startWithSleep = 0;
        for (int j = 0; j < diaries->activityCounts[i]; j++) {
            if (10101 == diaries->values[i][j].activity) {
                sleepCount++;
                if (0 == j) {
                    startWithSleep = 1;
                }
                if (j == diaries->activityCounts[i] - 1 && startWithSleep) {
                    sleepCount--;
                }
            }
        }

        double weight = diaries->weights[i];
        totalWeight += weight;

        if (sleepCount == 1) {
            monophasic += weight;
        } else if (sleepCount == 2) {
            biphasic += weight;
        } else if (sleepCount >= 3) {
            polyphasic += weight;
        }
    }

    totalWeight /= 100;

    printf("monophasic, biphasic, polyphasic\n");
    printf("%f%%, %f%%, %f%%\n", monophasic / totalWeight, biphasic / totalWeight, polyphasic / totalWeight);

    free(diaries);

    double runningTime = difftime(time(NULL), startTime);
    printf("Completed in %.f seconds", runningTime);
}